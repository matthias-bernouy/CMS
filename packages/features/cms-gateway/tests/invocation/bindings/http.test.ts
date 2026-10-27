import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { createCapabilityQueryHandler } from "@bernouy/cms-gateway/http/handlers";
import { handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { resolveGatewayHttpRoute } from "cms-gateway/invocation/http/route/bindings";
import { scope, invocation, context, mcp, http } from "./fixture";
import { NOW } from "../../fixtures";

test("HTTP aliases resolve and dispatch the exact binding selected by the incoming route", async () => {
    const f = await scope([http(), http("alias", "/v2/items"), mcp]);
    const paths: string[] = [];
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => f.route, isCurrent: async () => true },
        authorize: async () => true,
        now: () => NOW,
        transport: new HttpGatewayTransport({
            network: {
                async exchange(request) {
                    paths.push(request.pathAndQuery);
                    return Response.json({ items: ["found"] });
                },
            },
        }),
    });
    for (const path of ["/v1/items", "/v2/items"]) {
        const response = await handleGatewayHttpCall(new Request(`https://cms.test/.cms/call/catalog${path}?term=x`), {
            ...context,
            invoker: gateway,
            prefix: "/.cms/call",
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: ["found"] });
    }
    expect(paths).toEqual(["/v1/items?term=x", "/v2/items?term=x"]);
});

test("an MCP-only capability has no HTTP route and the HTTP transport fails before network access", async () => {
    const f = await scope([mcp]);
    await expect(
        resolveGatewayHttpRoute(f.gateway, { ...invocation, method: "GET", path: "/v1/items" }),
    ).rejects.toMatchObject({ code: "invalid_route" });
    let calls = 0;
    const transport = new HttpGatewayTransport({
        network: {
            async exchange() {
                calls++;
                return Response.json({ items: [] });
            },
        },
    });
    await f.gateway.invoke(invocation);
    await expect(transport.send(f.sent[0]!)).rejects.toMatchObject({ code: "unsupported_behavior" });
    expect(calls).toBe(0);
});

test("logical HTTP entry points cannot expose an MCP-only capability", async () => {
    for (const bindings of [[mcp], [http(), mcp]]) {
        const f = await scope(bindings);
        const handler = createCapabilityQueryHandler({
            siteId: context.siteId,
            basePath: "",
            invoker: f.gateway,
            resolveActor: async () => context.actor,
            resolveCapability: async () => ({ access: "public", effect: "query", outputType: "object" }),
        });
        const response = await handler(new Request("https://cms.test/.cms/query/catalog/item.list"));
        expect(response.status).toBe(bindings.length === 1 ? 404 : 200);
        expect(f.sent).toHaveLength(bindings.length === 1 ? 0 : 1);
    }
});

test("HTTP response validation rejects wire status and content-type errors inside the adapter", async () => {
    const f = await scope([http()]);
    await f.gateway.invoke(invocation);
    for (const response of [
        Response.json({ items: [] }, { status: 201 }),
        new Response(JSON.stringify({ items: [] }), { headers: { "content-type": "text/plain" } }),
        Response.json({ error: { code: "UNKNOWN" } }, { status: 404 }),
    ]) {
        const transport = new HttpGatewayTransport({ network: { exchange: async () => response } });
        await expect(transport.send(f.sent[0]!)).rejects.toMatchObject({ code: "invalid_provider_response" });
    }
});

test("logical HTTP execution requires a contract resolver and never dispatches without one", async () => {
    let calls = 0;
    const handler = createCapabilityQueryHandler({
        siteId: context.siteId,
        basePath: "",
        resolveActor: async () => context.actor,
        resolveCapability: async () => ({ access: "public", effect: "query", outputType: "object" }),
        invoker: {
            invoke: async () => {
                calls++;
                return { kind: "success", requestId: "test", output: {} };
            },
        } as never,
    });
    const response = await handler(new Request("https://cms.test/.cms/query/catalog/item.list"));
    expect(response.status).toBe(503);
    expect(calls).toBe(0);
});

test("the explicit first-byte timeout aborts a Provider that never returns headers", async () => {
    const f = await scope([http()]);
    await f.gateway.invoke(invocation);
    let dispatched = 0;
    const transport = new HttpGatewayTransport({
        firstByteTimeoutMs: 5,
        network: {
            exchange: (request) =>
                new Promise((_resolve, reject) => {
                    dispatched++;
                    request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
                }),
        },
    });
    await expect(transport.send(f.sent[0]!)).rejects.toThrow("first byte timed out");
    expect(dispatched).toBe(1);
});
