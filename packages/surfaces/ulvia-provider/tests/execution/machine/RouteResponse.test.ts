import { expect, test, spyOn } from "bun:test";
import { routeResponse } from "../../../src/transport/routeResponse";

test("route compression preserves complete JSON and no-store semantics, honors negotiation and shrinks the payload", async () => {
    const body = {
        route: JSON.stringify({
            contracts: Array(100).fill({ id: "content", description: "immutable catalogue metadata" }),
        }),
    };
    const json = JSON.stringify(body);
    const compressed = await routeResponse(
        new Request("https://provider.test/gateway/route", { headers: { "accept-encoding": "gzip" } }),
        Response.json(body, { headers: { "cache-control": "no-store" } }),
    );
    expect(compressed.headers.get("cache-control")).toBe("no-store");
    expect(compressed.headers.get("content-encoding")).toBe("gzip");
    const bytes = await compressed.arrayBuffer();
    expect(bytes.byteLength).toBeLessThan(json.length / 4);
    const decoded = await new Response(new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"))).json();
    expect(decoded).toEqual(body);
    const plain = await routeResponse(
        new Request("https://provider.test/gateway/route", { headers: { "accept-encoding": "gzip;q=0" } }),
        Response.json(body),
    );
    expect(plain.headers.has("content-encoding")).toBe(false);
    expect(await plain.json()).toEqual(body);
});

test("a route-compression rejection is caught and journaled by the capability relay", async () => {
    const { admitContractRelease } = await import("@bernouy/cms-repository/contracts");
    const { NOOP_LOGGER } = await import("@bernouy/logging");
    const { contractRelease, resolveFixtureContract } = await import("../../ulviaProviderFixture");
    const { createProviderContractRelay } = await import("../../../src/transport/relay");
    const { compileProviderRoutes } = await import("../../../src/transport/routes");
    const source = (await contractRelease()).release;
    const capability = source.capabilities[0]!;
    const admission = await admitContractRelease({
        ...source,
        contractId: "ulvia.cms.installations",
        capabilities: [
            {
                ...capability,
                id: "gateway.route.get",
                behavior: { effect: "query", execution: "sync", sensitive: true },
                input: {
                    type: "object",
                    properties: { contractId: { type: "string", maxLength: 128 } },
                    required: ["contractId"],
                },
                output: {
                    type: "object",
                    properties: { route: { type: "string", maxLength: 128 } },
                    required: ["route"],
                },
                bindings: [
                    { ...capability.bindings[0], method: "QUERY", path: "/gateway/route", input: { body: true } },
                ],
            },
        ],
    });
    const failures: string[] = [];
    const relay = createProviderContractRelay(
        compileProviderRoutes([resolveFixtureContract(admission)]),
        {
            invoke: async () => ({ route: "{}" }),
        },
        { siteId: "default", providerId: "ulvia.official" },
        {
            ...NOOP_LOGGER,
            error: (event) => {
                failures.push(event);
            },
        },
    );
    const requestId = crypto.randomUUID();
    const request = new Request("https://provider.test/gateway/route", {
        method: "QUERY",
        body: JSON.stringify({ contractId: "catalog" }),
        headers: {
            "content-type": "application/json",
            "accept-encoding": "gzip",
            "x-ulvia-request-id": requestId,
        },
    });
    const now = Math.floor(Date.now() / 1000);
    const failure = spyOn(Response.prototype, "arrayBuffer").mockRejectedValueOnce(
        new Error("compression read failed"),
    );
    try {
        const response = await relay(
            request,
            {
                version: 1,
                requestId,
                instanceId: "instance:a",
                contractId: "ulvia.cms.installations",
                contractVersion: "1.0.0",
                capabilityId: "gateway.route.get",
                issuedAt: now,
                expiresAt: now + 30,
            },
            true,
        );
        expect(response?.status).toBe(503);
        expect(failures).toEqual(["provider.capability.failed"]);
    } finally {
        failure.mockRestore();
    }
});
