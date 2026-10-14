import { expect, test } from "bun:test";
import { GatewayError, type GatewayInvocation } from "@bernouy/cms-gateway";
import { createCapabilityHttpHandler, createCapabilityQueryHandler } from "@bernouy/cms-gateway/http/handlers";

test("authenticates provider machine calls independently from users", async () => {
    const calls: GatewayInvocation[] = [];
    const handler = createCapabilityHttpHandler({
        basePath: "",
        siteId: "site-a",
        authenticateProvider: async (token: string) => (token === "provider-secret-token" ? "install-caller" : null),
        invoker: invoker(calls),
        resolveActor: async () => ({ kind: "anonymous" }),
    });
    const response = await handler(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: {
                authorization: "Bearer provider-secret-token",
                "content-type": "application/json",
            },
            body: '{"term":"one"}',
        }),
    );

    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
        origin: "provider",
        actor: { kind: "provider", installationId: "install-caller" },
    });
});

test("projects gateway authorization failures", async () => {
    const handler = createCapabilityHttpHandler({
        basePath: "",
        siteId: "site-a",
        authenticateProvider: async () => "install-caller",
        invoker: {
            ...invoker([]),
            invoke: async () => {
                throw new GatewayError("not_authorized", "denied");
            },
        },
        resolveActor: async () => ({ kind: "anonymous" }),
    });
    const denied = await handler(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { authorization: "Bearer provider-token", "content-type": "application/json" },
            body: "{}",
        }),
    );

    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: { code: "not_authorized" } });
});

test("logical Page queries use GET without input and QUERY with structured input", async () => {
    const calls: GatewayInvocation[] = [];
    const handler = createCapabilityQueryHandler({
        basePath: "",
        siteId: "site-a",
        invoker: invoker(calls),
        resolveActor: async () => ({ kind: "user", subjectId: "subject-a" }),
        resolveCapability: async () => ({ effect: "query", outputType: "object" }),
        pageExecution: {
            requiredAccess: async () => "public",
            authorizeCall: async () =>
                ({
                    planDigest: "sha256:page-plan",
                    version: "1.0.0",
                    digest: "sha256:release",
                    installationId: "provider-a",
                }) as never,
        },
    });

    expect(
        (
            await handler(
                new Request("http://site/.cms/query/catalog/item.list", {
                    headers: { referer: "http://site/catalog" },
                }),
            )
        ).status,
    ).toBe(200);
    expect(
        (
            await handler(
                new Request("http://site/.cms/query/catalog/item.list", {
                    method: "QUERY",
                    headers: { "content-type": "application/json", referer: "http://site/catalog" },
                    body: '{"term":"one"}',
                }),
            )
        ).status,
    ).toBe(200);
    expect(calls.map(({ input }) => input)).toEqual([{}, { term: "one" }]);
});

test("logical Page queries reject commands, binary results and mutation transports", async () => {
    const calls: GatewayInvocation[] = [];
    let descriptor: { effect: "query" | "command"; outputType: string } = {
        effect: "command",
        outputType: "object",
    };
    const handler = createCapabilityQueryHandler({
        basePath: "",
        siteId: "site-a",
        invoker: invoker(calls),
        resolveActor: async () => ({ kind: "anonymous" }),
        resolveCapability: async () => descriptor,
        pageExecution: {
            requiredAccess: async () => "public",
            authorizeCall: async () => ({}) as never,
        },
    });

    expect((await handler(new Request("http://site/.cms/query/catalog/item.list"))).status).toBe(404);
    descriptor = { effect: "query", outputType: "binary" };
    expect((await handler(new Request("http://site/.cms/query/catalog/item.list"))).status).toBe(404);
    descriptor = { effect: "query", outputType: "object" };
    expect(
        (
            await handler(
                new Request("http://site/.cms/query/catalog/item.list", {
                    method: "POST",
                    body: "{}",
                }),
            )
        ).status,
    ).toBe(404);
    expect(calls).toEqual([]);
});

function invoker(calls: GatewayInvocation[]) {
    return {
        resolveHttp: async () =>
            ({
                capability: {
                    id: "item.list",
                    input: {
                        type: "object",
                        properties: { term: { type: "string", maxLength: 50 } },
                        required: [],
                    },
                },
                binding: {
                    method: "POST",
                    path: "/v1/items",
                    pathParameters: [],
                    query: [],
                    headers: [],
                    body: { kind: "json", properties: ["term"], contentTypes: ["application/json"] },
                },
                pathValues: {},
            }) as never,
        invoke: async (invocation: GatewayInvocation) => {
            calls.push(invocation);
            return { kind: "success" as const, status: 200, requestId: "request-1", output: { items: ["one"] } };
        },
    };
}
