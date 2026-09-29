import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { buildHttpInvocation, HttpGatewayTransport, type GatewayHttpExchange } from "@bernouy/cms-gateway/http";
import { gatewayRoute } from "./fixtures";

test("compiled HTTP request preserves the json-percent wire profile", async () => {
    const route = await gatewayRoute();
    const capability = route.release.admission.release.capabilities[0]!;
    const binding = route.release.admission.bindings[0]!.binding;
    const prepared = buildHttpInvocation({
        requestId: "request-1",
        siteId: "site-a",
        installationId: "install-a",
        endpoint: "https://provider.example.com",
        providerTokenRef: "${PROVIDER_TOKEN}",
        release: route.release.admission.release,
        capability,
        binding,
        input: { term: "a b" },
        invocationOrigin: "delivery",
        actorKind: "anonymous",
    });
    expect(prepared).toEqual({
        origin: "https://provider.example.com",
        pathAndQuery: "/v1/items?term=%22a%20b%22",
        method: "GET",
        headers: {},
    });
    expect(JSON.stringify(prepared)).not.toContain("PROVIDER_TOKEN");
});

test("HTTP transport bounds and parses responses through an injected network boundary", async () => {
    const route = await gatewayRoute();
    const exchanges: GatewayHttpExchange[] = [];
    const transport = new HttpGatewayTransport({
        network: {
            exchange: async (request) => {
                exchanges.push(request);
                return Response.json({ items: ["one"] });
            },
        },
        maxResponseBytes: 128,
    });
    const request = {
        requestId: "request-1",
        siteId: "site-a",
        installationId: "install-a",
        endpoint: "https://provider.example.com",
        providerTokenRef: "${PROVIDER_TOKEN}",
        release: route.release.admission.release,
        capability: route.release.admission.release.capabilities[0]!,
        binding: route.release.admission.bindings[0]!.binding,
        input: { term: "a b" },
        invocationOrigin: "delivery" as const,
        actorKind: "anonymous" as const,
    };
    expect(await transport.send(request)).toMatchObject({
        status: 200,
        contentType: expect.stringContaining("application/json"),
        output: { items: ["one"] },
    });
    expect(exchanges[0]).toMatchObject({
        origin: "https://provider.example.com",
        pathAndQuery: "/v1/items?term=%22a%20b%22",
    });
    const bounded = new HttpGatewayTransport({
        network: { exchange: async () => Response.json({ items: ["too large"] }) },
        maxResponseBytes: 8,
    });
    await expect(bounded.send(request)).rejects.toMatchObject({ code: "invalid_provider_response" });
});

test("gateway validates a real HTTP exchange and classifies malformed responses", async () => {
    const route = await gatewayRoute();
    let response = Response.json({ items: ["one"], ignored: true });
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        transport: new HttpGatewayTransport({ network: { exchange: async () => response } }),
        authorize: async () => true,
        now: () => "2026-09-29T08:00:00.000Z",
    });
    const call = {
        siteId: "site-a",
        contractId: "catalog",
        capabilityId: "item.list",
        actor: { kind: "anonymous" as const },
        origin: "delivery" as const,
        input: { term: "one" },
    };
    await expect(gateway.invoke(call)).resolves.toMatchObject({ kind: "success", output: { items: ["one"] } });
    response = Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    await expect(gateway.invoke(call)).resolves.toMatchObject({ kind: "declared-error", errorCode: "NOT_FOUND" });
    response = new Response("not JSON", { status: 200, headers: { "content-type": "application/json" } });
    await expect(gateway.invoke(call)).rejects.toMatchObject({ code: "invalid_provider_response" });
    response = Response.redirect("https://elsewhere.example.com");
    await expect(gateway.invoke(call)).rejects.toMatchObject({ code: "invalid_provider_response" });
    response = new Response('{"error":{"code":"NOT_FOUND"}}', {
        status: 404,
        headers: { "content-type": "text/plain" },
    });
    await expect(gateway.invoke(call)).rejects.toMatchObject({ code: "invalid_provider_response" });
});

test("HTTP invocation accepts only canonical approved loopback origins", async () => {
    const route = await gatewayRoute();
    const request = {
        requestId: "request-1",
        siteId: "site-a",
        installationId: "install-a",
        endpoint: "http://127.0.0.1:8080",
        providerTokenRef: "token-ref",
        release: route.release.admission.release,
        capability: route.release.admission.release.capabilities[0]!,
        binding: route.release.admission.bindings[0]!.binding,
        input: { term: "one" },
        invocationOrigin: "delivery" as const,
        actorKind: "anonymous" as const,
    };
    expect(buildHttpInvocation(request).origin).toBe(request.endpoint);
    expect(() => buildHttpInvocation({ ...request, endpoint: "http://localhost:8080" })).toThrow();
    expect(() => buildHttpInvocation({ ...request, endpoint: "https://provider.example.com/path" })).toThrow();
});
