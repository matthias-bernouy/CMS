import { expect, test } from "bun:test";
import { ProviderObservationRefresher } from "../../src/runtime/gateway/ProviderObservationRefresher";

test("provider observation refresh uses the pinned network and records a validated report", async () => {
    const fixture = installationFixture();
    const requests: unknown[] = [];
    const observations: unknown[] = [];
    const refresher = new ProviderObservationRefresher(
        "site-a",
        selectedInstallation(),
        {
            list: async () => [fixture],
            recordObservation: async (scope, revision, report) => {
                observations.push({ scope, revision, report });
                return fixture;
            },
        } as never,
        {
            exchange: async (request) => {
                requests.push(request);
                return Response.json(fixture.observation.report);
            },
        },
    );
    await refresher.runOnce();
    expect(requests).toMatchObject([
        {
            origin: fixture.installation.endpoint,
            pathAndQuery: "/ulvia/report",
            method: "GET",
            providerTokenRef: fixture.installation.providerTokenRef,
            invocationOrigin: "system",
        },
    ]);
    expect(observations).toMatchObject([
        {
            scope: { siteId: "site-a", installationId: "install-a" },
            revision: fixture.revision,
            report: fixture.observation.report,
        },
    ]);
});

test("provider observation refresh does not store an invalid report", async () => {
    const fixture = installationFixture();
    let writes = 0;
    const refresher = new ProviderObservationRefresher(
        "site-a",
        selectedInstallation(),
        {
            list: async () => [fixture],
            recordObservation: async () => {
                writes += 1;
                return fixture;
            },
        } as never,
        { exchange: async () => new Response("not JSON", { headers: { "content-type": "text/plain" } }) },
    );
    const failed = new Promise<Error>((resolve) => refresher.start(resolve));
    const error = await failed;
    await refresher.stop();
    expect(writes).toBe(0);
    expect(error.message).toContain("install-a");
    expect(error.message).not.toContain("PROVIDER_TOKEN");
});

test("provider observation refresh skips unselected and recently observed installations", async () => {
    const fixture = installationFixture();
    const recent = {
        ...fixture,
        observation: { ...fixture.observation, observedAt: new Date().toISOString() },
    };
    let calls = 0;
    const refresher = new ProviderObservationRefresher(
        "site-a",
        selectedInstallation(),
        { list: async () => [recent], recordObservation: async () => recent } as never,
        {
            exchange: async () => {
                calls += 1;
                return Response.json(fixture.observation.report);
            },
        },
    );
    await refresher.runOnce();
    expect(calls).toBe(0);
    const unselected = new ProviderObservationRefresher(
        "site-a",
        { get: async () => ({ plan: { selections: [] } }) } as never,
        { list: async () => [fixture], recordObservation: async () => fixture } as never,
        {
            exchange: async () => {
                calls += 1;
                return Response.json(fixture.observation.report);
            },
        },
    );
    await unselected.runOnce();
    expect(calls).toBe(0);
});

test("provider observation shutdown waits for an active refresh", async () => {
    const fixture = installationFixture();
    let finish!: (response: Response) => void;
    let begun!: () => void;
    const started = new Promise<void>((resolve) => {
        begun = resolve;
    });
    const response = new Promise<Response>((resolve) => {
        finish = resolve;
    });
    const refresher = new ProviderObservationRefresher(
        "site-a",
        selectedInstallation(),
        { list: async () => [fixture], recordObservation: async () => fixture } as never,
        {
            exchange: async () => {
                begun();
                return response;
            },
        },
    );
    refresher.start(() => undefined);
    await started;
    let stopped = false;
    const stopping = refresher.stop().then(() => {
        stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish(Response.json(fixture.observation.report));
    await stopping;
    expect(stopped).toBe(true);
});

test("provider observation shutdown succeeds after a failed selection read", async () => {
    const refresher = new ProviderObservationRefresher(
        "site-a",
        { get: async () => Promise.reject(new Error("database unavailable")) } as never,
        { list: async () => [] } as never,
        { exchange: async () => Response.json({}) },
    );
    const reported = new Promise<Error>((resolve) => refresher.start(resolve));
    expect((await reported).message).toBe("Provider observation request_failed");
    await expect(refresher.stop()).resolves.toBeUndefined();
});

function selectedInstallation() {
    return { get: async () => ({ plan: { selections: [{ installationId: "install-a" }] } }) } as never;
}

function installationFixture() {
    const report = {
        protocol: "ulvia-provider/v1",
        providerId: "ulvia.example",
        account: { id: "account-a", label: "Account A" },
        buildVersion: "1.0.0",
        manifest: { version: "1.0.0", digest: `sha256:${"a".repeat(64)}` },
        implementations: [
            { contractId: "catalog", version: "1.0.0", digest: `sha256:${"b".repeat(64)}`, status: "ready" },
        ],
    };
    return {
        revision: 2,
        installation: {
            id: "install-a",
            siteId: "site-a",
            endpoint: "https://provider.example.com",
            providerTokenRef: "${PROVIDER_TOKEN}",
            status: "enabled",
        },
        observation: { report },
    };
}
