import { expect, test } from "bun:test";
import { fetchInstallationsProviderReport } from "../../src/runtime/gateway/control";
import { InstallationsProviderTransport } from "../../src/runtime/gateway/InstallationsProviderTransport";

test("the public Provider report accepts the exact installations control contract", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const report = await providerReport();
    const endpoint = "http://ulvia-provider:5103";
    const token = "provider-token-at-least-twenty";
    const transport = new InstallationsProviderTransport(endpoint, token, (async (url, init) => {
        requests.push({ url: url.toString(), init });
        return Response.json(report);
    }) as typeof fetch);
    const result = await fetchInstallationsProviderReport(transport);

    expect(result).toEqual(report);
    expect(requests[0]?.url).toBe("http://ulvia-provider:5103/ulvia/report");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(() => new InstallationsProviderTransport("https://api.provider.example", "invalid")).toThrow(
        "Invalid provider token",
    );
});

test("the public Provider report rejects unavailable or substituted installations control contracts", async () => {
    const report = await providerReport();
    const endpoint = "http://ulvia-provider:5103";
    const token = "provider-token-at-least-twenty";
    const transport = new InstallationsProviderTransport(endpoint, token, (async () =>
        Response.json(report)) as typeof fetch);

    report.implementations[0]!.status = "unavailable";
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("required control contract");
    report.implementations[0]!.status = "ready";
    report.implementations[0]!.digest = `sha256:${"b".repeat(64)}`;
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("required control contract");
});

async function providerReport() {
    const manifest = await Bun.file(
        new URL("../../../ulvia-cli/dist/bootstrap/providers/primary-provider/definition.json", import.meta.url),
    ).json();
    const current = manifest.implementations.find(
        (item: { contractId: string }) => item.contractId === "ulvia/cms.installations",
    );
    return {
        protocol: "ulvia-provider/v1",
        providerId: "ulvia/ulvia.example",
        instanceId: "instance:account-a",
        account: { id: "account-a", label: "Account A" },
        buildVersion: "1.0.0",
        manifest: { version: "1.0.0", digest: `sha256:${"a".repeat(64)}` },
        implementations: [
            {
                contractId: "ulvia/cms.installations",
                version: current.version,
                digest: current.digest,
                status: "ready",
            },
        ],
    };
}

test("the control contract refuses a substituted digest and an unselected version", async () => {
    const report = await providerReport();
    report.implementations[0] = {
        contractId: "ulvia/cms.installations",
        version: "1.0.0",
        digest: `sha256:${"b".repeat(64)}`,
        status: "ready",
    };
    const transport = new InstallationsProviderTransport(
        "https://provider.test",
        "provider-token-at-least-twenty",
        (async () => Response.json(report)) as typeof fetch,
    );
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("required control contract");
    report.implementations[0]!.version = "1.0.1";
    await expect(fetchInstallationsProviderReport(transport)).rejects.toThrow("required control contract");
});

test("a rejected control lease is renewed once before the final audit without replaying capability dispatch", async () => {
    const headers: string[] = [];
    let renewals = 0;
    let cancelled = false;
    const transport = new InstallationsProviderTransport(
        "http://provider:5103",
        "old-control-lease-credential",
        (async (_url, init) => {
            headers.push(new Headers(init?.headers).get("authorization")!);
            return headers.length === 1
                ? new Response(
                      new ReadableStream({
                          cancel() {
                              cancelled = true;
                          },
                      }),
                      { status: 401 },
                  )
                : Response.json({ accepted: true });
        }) as typeof fetch,
        async () => {
            renewals++;
            return "renewed-control-lease-credential";
        },
    );
    expect((await transport.request("/gateway/audit", { method: "POST", body: '{"event":"completed"}' })).status).toBe(
        200,
    );
    expect(headers).toEqual(["Bearer old-control-lease-credential", "Bearer renewed-control-lease-credential"]);
    expect(renewals).toBe(1);
    expect(cancelled).toBe(true);
});

test("control renewal never retries business refusals, unreplayable bodies or a second authentication failure", async () => {
    for (const status of [401, 403, 409]) {
        let calls = 0;
        let renewals = 0;
        const transport = new InstallationsProviderTransport(
            "http://provider:5103",
            "old-control-lease-credential",
            (async () => {
                calls++;
                return new Response(null, { status });
            }) as typeof fetch,
            async () => {
                renewals++;
                return "renewed-control-lease-credential";
            },
        );
        expect((await transport.request("/gateway/audit", { method: "POST", body: "{}" })).status).toBe(status);
        expect(calls).toBe(status === 401 ? 2 : 1);
        expect(renewals).toBe(status === 401 ? 1 : 0);
        calls = 0;
        renewals = 0;
        expect((await transport.request("/gateway/audit", { method: "POST", body: new ReadableStream() })).status).toBe(
            status,
        );
        expect(calls).toBe(1);
        expect(renewals).toBe(0);
    }
});
