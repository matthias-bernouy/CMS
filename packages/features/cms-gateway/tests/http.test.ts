import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { handleGatewayFileGet, handleGatewayHttpCall } from "@bernouy/cms-gateway/handlers";
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

test("gateway serves bounded provider file bytes with the declared media type", async () => {
    const route = await gatewayRoute({ binary: true });
    let upstream = new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { "content-type": "image/png" },
    });
    const exchanges: GatewayHttpExchange[] = [];
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        transport: new HttpGatewayTransport({
            network: {
                exchange: async (request) => {
                    exchanges.push(request);
                    return upstream;
                },
            },
        }),
        authorize: async () => true,
        now: () => "2026-09-29T08:00:00.000Z",
    });
    const call = () =>
        handleGatewayHttpCall(
            new Request("https://site.example/.cms/call/catalog/item.list", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ fileId: "one" }),
            }),
            {
                siteId: "site-a",
                origin: "delivery",
                actor: { kind: "anonymous" },
                prefix: "/.cms/call",
                invoker: gateway,
            },
        );
    const result = await call();
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("image/png");
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3, 4]).buffer);
    expect(exchanges[0]?.accept).toBe("image/png");

    upstream = new Response(new Uint8Array([5, 6]), { headers: { "content-type": "image/png" } });
    const file = await handleGatewayFileGet(new Request("https://site.example/.cms/media/catalog/item.list/photo-1"), {
        siteId: "site-a",
        origin: "delivery",
        actor: { kind: "anonymous" },
        prefix: "/.cms/media",
        invoker: gateway,
    });
    expect(file.status).toBe(200);
    expect(await file.arrayBuffer()).toEqual(new Uint8Array([5, 6]).buffer);
    expect(exchanges[1]?.pathAndQuery).toBe("/v1/files/%22photo-1%22");

    upstream = Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    const missing = await handleGatewayFileGet(
        new Request("https://site.example/.cms/media/catalog/item.list/missing"),
        {
            siteId: "site-a",
            origin: "delivery",
            actor: { kind: "anonymous" },
            prefix: "/.cms/media",
            invoker: gateway,
        },
    );
    expect(missing.status).toBe(404);

    upstream = new Response(new Uint8Array(9), { headers: { "content-type": "image/png" } });
    expect((await call()).status).toBe(502);
    upstream = new Response(new Uint8Array([1]), { headers: { "content-type": "text/plain" } });
    expect((await call()).status).toBe(502);
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

test("HTTP call envelope preserves bodyless results and rejects wrong methods", async () => {
    const options = {
        siteId: "site-a",
        origin: "delivery" as const,
        actor: { kind: "anonymous" as const },
        prefix: "/.cms/call",
        invoker: {
            invoke: async () => ({ kind: "success" as const, status: 204, requestId: "request-1", output: null }),
        },
    };
    const url = "https://site.example/.cms/call/catalog/item.list";
    const response = await handleGatewayHttpCall(
        new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
        options,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("x-ulvia-request-id")).toBe("request-1");
    expect(await response.text()).toBe("");
    const wrongMethod = await handleGatewayHttpCall(new Request(url), options);
    expect(wrongMethod.status).toBe(405);
});
