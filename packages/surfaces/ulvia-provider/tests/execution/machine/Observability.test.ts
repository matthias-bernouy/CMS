import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { CmsObservability } from "@bernouy/cms-observability";
import { InMemoryJournalStore } from "@bernouy/cms-observability/memory";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import {
    registerObservabilityCapabilities,
    registerProviderInstallationCapabilities,
} from "@bernouy/ulvia-provider/capabilities";
import { UlviaProvider, DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { providerOptions, PROVIDER_TOKEN } from "../../ulviaProviderFixture";

const contractId = "ulvia.cms.observability";
const contractPath = resolve(
    import.meta.dir,
    "../../../../../runtimes/ulvia-cli/dist/bootstrap/contracts/cms",
    contractId,
    "definition.json",
);
const entry = () => ({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    level: "error",
    event: "page.render.failed",
    attributes: { password: "never-store-me", note: "x".repeat(1016) + " token=a" },
});

function headers(instanceId: string, capabilityId: string, systemServiceId?: string): Record<string, string> {
    const requestId = crypto.randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = signProviderInvocationToken(PROVIDER_TOKEN, {
        version: 1,
        requestId,
        instanceId,
        contractId,
        contractVersion: "1.0.0",
        capabilityId,
        ...(systemServiceId ? { systemServiceId } : {}),
        issuedAt,
        expiresAt: issuedAt + 30,
    });
    return { authorization: `Bearer ${token}`, "x-ulvia-request-id": requestId, "content-type": "application/json" };
}

test("HTTP ingestion requires a signed machine identity and cannot choose another instance", async () => {
    const admission = await admitContractReleaseJson(await Bun.file(contractPath).text());
    const store = new InMemoryJournalStore();
    const instanceId = "instance:observability-a";
    const journal = new CmsObservability({ store, instanceId, cursorKey: PROVIDER_TOKEN });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerObservabilityCapabilities(dispatcher, journal);
    const runner = new BunRunner();
    new UlviaProvider(runner, providerOptions([admission], dispatcher, instanceId));
    const server = serveForTest(runner);
    try {
        const item = entry();
        const request = (body: unknown, identity = headers(instanceId, "logs.append", "cms-edge")) =>
            server.request("POST", "/observability/logs/append", { headers: identity, body: JSON.stringify(body) });
        expect(
            (
                await request(
                    { entries: [item] },
                    { ...headers(instanceId, "logs.append"), "x-ulvia-system-service-id": "cms-edge" },
                )
            ).status,
        ).toBe(403);
        expect(
            (await request({ entries: [item] }, headers("instance:observability-b", "logs.append", "cms-edge"))).status,
        ).toBe(401);
        expect((await request({ entries: [item], instanceId: "instance:observability-b" })).status).toBe(400);
        expect(await (await request({ entries: [item] })).json()).toEqual({ accepted: 1, stored: 1, duplicates: 0 });
        expect(await (await request({ entries: [item] })).json()).toEqual({ accepted: 1, stored: 0, duplicates: 1 });
        const response = await server.request("QUERY", "/observability/logs/query", {
            headers: headers(instanceId, "logs.query"),
            body: JSON.stringify({ levels: ["error"] }),
        });
        const result = (await response.json()) as { items: { id: string; instanceId: string; service: string }[] };
        expect(response.status).toBe(200);
        expect(result.items[0]).toMatchObject({ id: item.id, instanceId, service: "cms-edge" });
        expect(result.items[0]).not.toHaveProperty("attributes");
        expect(JSON.stringify(await journal.get({ id: item.id }))).not.toContain("never-store-me");
        const detail = await server.request("QUERY", "/observability/logs/get", {
            headers: headers(instanceId, "logs.get"),
            body: JSON.stringify({ id: item.id }),
        });
        expect(detail.status).toBe(200);
        expect((await detail.json()).attributes.note).toHaveLength(1024);
        const other = new CmsObservability({
            store,
            instanceId: "instance:observability-b",
            cursorKey: PROVIDER_TOKEN,
        });
        expect((await other.query({})).items).toEqual([]);
    } finally {
        server.stop();
    }
});

test("user invocations cannot use Installations to forge a machine identity", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const issued: unknown[] = [];
    registerProviderInstallationCapabilities(dispatcher, {
        invocations: {
            issue: async (input: unknown) => {
                issued.push(input);
                return { token: "scoped-token", instanceId: "instance-a" };
            },
        },
    } as never);
    const input = {
        requestId: crypto.randomUUID(),
        installationId: "provider-a",
        contractId,
        contractVersion: "1.0.0",
        capabilityId: "logs.append",
        systemServiceId: "cms-edge",
    };
    const context = {
        requestId: crypto.randomUUID(),
        contractVersion: "1.0.0",
        siteId: "default",
        providerId: "ulvia.official",
    };
    await expect(
        dispatcher.invoke("ulvia.cms.installations", "gateway.invocation.issue", input, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(issued).toEqual([]);
    await dispatcher.invoke("ulvia.cms.installations", "gateway.invocation.issue", input, {
        ...context,
        controlAuthority: true,
    });
    expect(issued).toEqual([input]);
});
