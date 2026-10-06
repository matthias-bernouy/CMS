import { expect, test } from "bun:test";
import { CapabilityGateway, GatewayError } from "@bernouy/cms-gateway";
import { gatewayRoutePrefix, handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { handleGatewayFileGet } from "@bernouy/cms-gateway/media/handlers";
import { buildHttpInvocation, HttpGatewayTransport, type GatewayHttpExchange } from "@bernouy/cms-gateway/http";
import { validateResponse } from "cms-gateway/invocation/core/validateResponse";
import { gatewayRoute } from "./fixtures";
import { InMemoryGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";

test("shared gateway routes remain relative to each surface base path", () => {
    expect(gatewayRoutePrefix("/", "/.cms/call")).toBe("/.cms/call");
    expect(gatewayRoutePrefix("/tenant/control/", "/.cms/call")).toBe("/tenant/control/.cms/call");
});

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

test("synchronous command sends validated JSON through its admitted POST binding", async () => {
    const route = await gatewayRoute({ behavior: { effect: "command", execution: "sync", idempotency: "natural" } });
    const exchanges: GatewayHttpExchange[] = [];
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        transport: new HttpGatewayTransport({
            network: {
                exchange: async (request) => {
                    exchanges.push(request);
                    return Response.json({ items: ["saved"] });
                },
            },
        }),
        authorize: async () => true,
        commandAudit: new InMemoryGatewayCommandAuditStore(),
        now: () => "2026-09-29T08:00:00.000Z",
    });
    const response = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/item.list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ term: "saved" }),
        }),
        {
            siteId: "site-a",
            origin: "delivery",
            actor: { kind: "anonymous" },
            prefix: "/.cms/call",
            invoker: gateway,
        },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: ["saved"] });
    expect(response.headers.get("x-ulvia-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(exchanges[0]).toMatchObject({
        method: "POST",
        pathAndQuery: "/v1/items",
        body: '{"term":"saved"}',
        headers: { "content-type": "application/json" },
    });
});

test("operation transport requests JSON and forwards the idempotency key", async () => {
    const route = await gatewayRoute({
        behavior: { effect: "command", execution: "operation", idempotency: "keyed" },
    });
    const exchanges: GatewayHttpExchange[] = [];
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        transport: new HttpGatewayTransport({
            network: {
                exchange: async (request) => {
                    exchanges.push(request);
                    return Response.json({ operationId: "00000000-0000-4000-8000-000000000010" }, { status: 202 });
                },
            },
        }),
        authorize: async () => true,
        commandAudit: new InMemoryGatewayCommandAuditStore(),
        now: () => "2026-09-29T08:00:00.000Z",
    });
    const response = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/item.list", {
            method: "POST",
            headers: { "content-type": "application/json", "idempotency-key": "operation-1" },
            body: JSON.stringify({ term: "saved" }),
        }),
        {
            siteId: "site-a",
            origin: "control",
            actor: { kind: "administrator", subjectId: "admin-1" },
            prefix: "/.cms/call",
            invoker: gateway,
        },
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ operationId: "00000000-0000-4000-8000-000000000010" });
    expect(exchanges[0]).toMatchObject({ accept: "application/json", idempotencyKey: "operation-1" });
});

test("HTTP command uncertainty is explicit and carries a reconciliation request ID", async () => {
    const response = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/item.list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"term":"one"}',
        }),
        {
            siteId: "site-a",
            origin: "delivery",
            actor: { kind: "anonymous" },
            prefix: "/.cms/call",
            invoker: {
                invoke: async () => {
                    throw new GatewayError("outcome_unknown", "uncertain", "request-123");
                },
            },
        },
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("x-ulvia-request-id")).toBe("request-123");
    expect(await response.json()).toEqual({ error: { code: "outcome_unknown" } });
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

test("HTTP transport deadline covers network exchange and a stalled response body", async () => {
    const route = await gatewayRoute();
    const request = {
        requestId: "request-1",
        siteId: "site-a",
        installationId: "install-a",
        endpoint: "https://provider.example.com",
        providerTokenRef: "${PROVIDER_TOKEN}",
        release: route.release.admission.release,
        capability: route.release.admission.release.capabilities[0]!,
        binding: route.release.admission.bindings[0]!.binding,
        input: { term: "one" },
        invocationOrigin: "delivery" as const,
        actorKind: "anonymous" as const,
    };
    const deadlineResult = (transport: HttpGatewayTransport) =>
        Promise.race([
            transport.send(request).then(
                () => "completed",
                (error: unknown) => (error as Error).name,
            ),
            new Promise<string>((resolve) => setTimeout(() => resolve("still-pending"), 250)),
        ]);
    const stalledExchange = new HttpGatewayTransport({
        network: { exchange: async () => new Promise<Response>(() => undefined) },
        timeoutMs: 10,
    });
    expect(await deadlineResult(stalledExchange)).toBe("TimeoutError");

    let cancelled = false;
    const stalledBody = new HttpGatewayTransport({
        network: {
            exchange: async () =>
                new Response(
                    new ReadableStream({
                        cancel() {
                            cancelled = true;
                        },
                    }),
                ),
        },
        timeoutMs: 10,
    });
    expect(await deadlineResult(stalledBody)).toBe("TimeoutError");
    expect(cancelled).toBe(true);
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
    response = Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers: { "retry-after": "30" } });
    await expect(gateway.invoke(call)).resolves.toMatchObject({
        kind: "declared-error",
        errorCode: "NOT_FOUND",
        responseHeaders: { "retry-after": "30" },
    });
    response = Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers: { "retry-after": "30" } });
    const declared = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/item.list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(call.input),
        }),
        { siteId: "site-a", origin: "delivery", actor: call.actor, prefix: "/.cms/call", invoker: gateway },
    );
    expect(declared.headers.get("retry-after")).toBe("30");
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
        headers: {
            "content-type": "image/png",
            etag: '"provider-version-1"',
            "content-disposition": 'inline; filename="photo.png"',
            "cache-control": "public, max-age=86400",
        },
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
    expect(result.headers.get("etag")).toBe('"provider-version-1"');
    expect(result.headers.get("content-disposition")).toBe('inline; filename="photo.png"');
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

    upstream = new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { "content-type": "image/png", etag: '"provider-version-2"' },
    });
    const partial = await handleGatewayFileGet(
        new Request("https://site.example/.cms/media/catalog/item.list/photo-1", {
            headers: { range: "bytes=1-2" },
        }),
        {
            siteId: "site-a",
            origin: "delivery",
            actor: { kind: "anonymous" },
            prefix: "/.cms/media",
            invoker: gateway,
        },
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 1-2/4");
    expect(partial.headers.get("accept-ranges")).toBe("bytes");
    expect(await partial.arrayBuffer()).toEqual(new Uint8Array([2, 3]).buffer);

    upstream = new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "content-type": "image/png" } });
    const unsatisfiable = await handleGatewayFileGet(
        new Request("https://site.example/.cms/media/catalog/item.list/photo-1", {
            headers: { range: "bytes=9-12" },
        }),
        {
            siteId: "site-a",
            origin: "delivery",
            actor: { kind: "anonymous" },
            prefix: "/.cms/media",
            invoker: gateway,
        },
    );
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get("content-range")).toBe("bytes */4");

    upstream = Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers: { "retry-after": "10" } });
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
    expect(missing.headers.get("retry-after")).toBe("10");
    expect(missing.headers.get("x-ulvia-request-id")).toMatch(/^[0-9a-f-]{36}$/);

    upstream = new Response(new Uint8Array(9), { headers: { "content-type": "image/png" } });
    expect((await call()).status).toBe(502);
    upstream = new Response(new Uint8Array([1]), { headers: { "content-type": "text/plain" } });
    expect((await call()).status).toBe(502);
});

test("partial provider bytes require a matching content range", async () => {
    const route = await gatewayRoute({ binary: true });
    const capability = route.release.admission.release.capabilities[0]!;
    const original = route.release.admission.bindings[0]!.binding;
    const binding = {
        ...original,
        response: { ...original.response, successStatuses: [206] },
    };
    const response = {
        status: 206,
        contentType: "image/png",
        bytes: new Uint8Array([2, 3]),
        responseHeaders: { "content-range": "bytes 1-2/4" },
    };
    expect(validateResponse(capability, binding, response, "request-1")).toMatchObject({
        kind: "binary",
        responseHeaders: { "content-range": "bytes 1-2/4" },
    });
    expect(() =>
        validateResponse(
            capability,
            binding,
            { ...response, responseHeaders: { "content-range": "bytes 1-3/4" } },
            "request-1",
        ),
    ).toThrow("content range");
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
