import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { gatewayRoutePrefix, handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { buildHttpInvocation, HttpGatewayTransport, type GatewayHttpExchange } from "@bernouy/cms-gateway/http";
import { InMemoryGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import { gatewayRoute } from "../fixtures";

test("gateway call URLs use the admitted binding path", async () => {
    const route = await gatewayRoute();
    const exchanges: GatewayHttpExchange[] = [];
    const gateway = gatewayFor(route, async (request) => {
        exchanges.push(request);
        return Response.json({ items: ["one"] });
    });
    const response = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/v1/items?term=one"),
        options(gateway),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: ["one"] });
    expect(exchanges[0]).toMatchObject({
        method: "GET",
        pathAndQuery: "/v1/items?term=one",
    });
});

test("commands map JSON bodies through their admitted binding", async () => {
    const route = await gatewayRoute({
        behavior: { effect: "command", execution: "sync", idempotency: "natural" },
    });
    const exchanges: GatewayHttpExchange[] = [];
    const gateway = gatewayFor(route, async (request) => {
        exchanges.push(request);
        return Response.json({ items: ["saved"] });
    });
    const response = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"term":"saved"}',
        }),
        options(gateway),
    );
    expect(response.status).toBe(200);
    expect(exchanges[0]).toMatchObject({
        method: "POST",
        pathAndQuery: "/v1/items",
        body: '{"term":"saved"}',
    });
});

test("binary provider responses stay streamed and retain safe resource headers", async () => {
    const route = await gatewayRoute({ binary: true });
    let pulls = 0;
    const gateway = gatewayFor(
        route,
        async () =>
            new Response(
                new ReadableStream({
                    pull(controller) {
                        pulls += 1;
                        controller.enqueue(new Uint8Array([1, 2]));
                        controller.close();
                    },
                }),
                {
                    headers: {
                        "content-type": "image/avif",
                        "content-length": "2",
                        "cache-control": "public, max-age=31536000, immutable",
                        etag: '"generation"',
                    },
                },
            ),
    );
    const response = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/v1/files/one"),
        options(gateway),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/avif");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
    expect(pulls).toBe(1);
});

test("HEAD is derived from binary GET and never emits a response body", async () => {
    const route = await gatewayRoute({ binary: true });
    const exchanges: GatewayHttpExchange[] = [];
    const gateway = gatewayFor(route, async (request) => {
        exchanges.push(request);
        return new Response(null, {
            headers: {
                "content-type": "application/octet-stream",
                "content-length": "8",
                etag: '"immutable"',
                "cache-control": "public, max-age=31536000, immutable",
                "accept-ranges": "bytes",
            },
        });
    });
    const response = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/v1/files/one", { method: "HEAD" }),
        options(gateway),
    );
    expect(response.status).toBe(200);
    expect(await response.arrayBuffer()).toHaveLength(0);
    expect(response.headers.get("content-length")).toBe("8");
    expect(response.headers.get("etag")).toBe('"immutable"');
    expect(exchanges[0]?.method).toBe("HEAD");
});

test("HEAD routing errors use headers and never serialize JSON", async () => {
    const route = await gatewayRoute({ binary: true });
    const response = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/v1/missing", { method: "HEAD" }),
        options(gatewayFor(route, async () => new Response(null))),
    );
    expect(response.status).toBe(404);
    expect(await response.arrayBuffer()).toHaveLength(0);
    expect(response.headers.get("x-ulvia-error-code")).toBe("invalid_route");
});

test("binary request bodies are forwarded without buffering", async () => {
    const route = await gatewayRoute({ binaryInput: true });
    let received = "";
    const gateway = gatewayFor(route, async (request) => {
        received = await new Response(request.body).text();
        return new Response(null, { status: 204 });
    });
    const response = await handleGatewayHttpCall(
        new Request("https://site.example/.cms/call/catalog/v1/uploads/upload-1", {
            method: "PUT",
            headers: { "content-type": "application/octet-stream", "content-length": "5" },
            body: "hello",
        }),
        options(gateway),
    );
    expect(response.status).toBe(204);
    expect(received).toBe("hello");
});

test("HTTP target construction never exposes provider credential references", async () => {
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
    expect(prepared.pathAndQuery).toBe("/v1/items?term=a%20b");
    expect(JSON.stringify(prepared)).not.toContain("PROVIDER_TOKEN");
    expect(gatewayRoutePrefix("/tenant/", "/.cms/call")).toBe("/tenant/.cms/call");
});

function gatewayFor(
    route: Awaited<ReturnType<typeof gatewayRoute>>,
    exchange: (request: GatewayHttpExchange) => Promise<Response>,
): CapabilityGateway {
    return new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        transport: new HttpGatewayTransport({ network: { exchange } }),
        authorize: async () => true,
        commandAudit: new InMemoryGatewayCommandAuditStore(),
        now: () => "2026-09-29T08:00:00.000Z",
    });
}

function options(invoker: CapabilityGateway) {
    return {
        siteId: "site-a",
        origin: "delivery" as const,
        actor: { kind: "anonymous" as const },
        prefix: "/.cms/call",
        invoker,
    };
}
