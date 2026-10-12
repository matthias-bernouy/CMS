import { expect, test } from "bun:test";
import { GatewayError, type GatewayInvocation } from "@bernouy/cms-gateway";
import { createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";

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
