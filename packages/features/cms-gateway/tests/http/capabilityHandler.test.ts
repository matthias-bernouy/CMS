import { expect, test } from "bun:test";
import { GatewayError, type GatewayInvocation } from "@bernouy/cms-gateway";
import {
    createCapabilityHttpHandler,
    createCapabilityMutationHandler,
    createCapabilityQueryHandler,
} from "@bernouy/cms-gateway/http/handlers";

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
        actor: { kind: "provider", installationId: "install-caller" },
    });
});

test("projects gateway authorization failures", async () => {
    const failures: Array<{ code: string; status: number }> = [];
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
        onFailure: (failure) => failures.push(failure),
    });
    const denied = await handler(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { authorization: "Bearer provider-token", "content-type": "application/json" },
            body: "{}",
        }),
    );

    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ failure: { code: "not_authorized", retryable: false } });
    expect(failures).toEqual([{ code: "not_authorized", status: 403, phase: "invocation" }]);
});

test("serves a public binary capability without a Page referer", async () => {
    const calls: GatewayInvocation[] = [];
    const handler = createCapabilityHttpHandler({
        basePath: "",
        siteId: "site-a",
        invoker: {
            resolveHttp: async () =>
                ({
                    capability: {
                        id: "files.read",
                        access: "public",
                        behavior: { effect: "query", execution: "sync" },
                        input: {
                            type: "object",
                            properties: { fileId: { type: "string", maxLength: 128 } },
                            required: ["fileId"],
                        },
                        output: { type: "binary", maxBytes: 1024 },
                    },
                    binding: {
                        method: "GET",
                        path: "/files/{fileId}",
                        pathParameters: [{ property: "fileId", wireName: "fileId", encoding: "uri-component" }],
                        query: [],
                        headers: [],
                    },
                    pathValues: { fileId: "photo-1" },
                }) as never,
            invoke: async (invocation) => {
                calls.push(invocation);
                return {
                    kind: "binary" as const,
                    status: 200,
                    requestId: "request-1",
                    contentType: "image/png",
                    stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
                };
            },
        },
        resolveActor: async () => {
            throw new Error("autonomous public resources do not resolve a user actor");
        },
    });

    const response = await handler(new Request("http://site/.cms/call/catalog/files/photo-1"));

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls).toEqual([expect.objectContaining({ actor: { kind: "anonymous" }, input: { fileId: "photo-1" } })]);
});

test("reports malformed Page capability routes with their client status", async () => {
    const failures: Array<{ code: string; status: number }> = [];
    const handler = createCapabilityHttpHandler({
        basePath: "",
        siteId: "site-a",
        invoker: invoker([]),
        resolveActor: async () => ({ kind: "anonymous" }),
        onFailure: (failure) => failures.push(failure),
    });

    const response = await handler(new Request("http://site/.cms/call/%/items", { method: "GET" }));

    expect(response.status).toBe(400);
    expect(failures).toEqual([{ code: "invalid_input", status: 400, phase: "authorization" }]);
});

test("logical Page queries use GET without input and QUERY with structured input", async () => {
    const calls: GatewayInvocation[] = [];
    const handler = createCapabilityQueryHandler({
        basePath: "",
        siteId: "site-a",
        invoker: invoker(calls),
        resolveActor: async () => ({ kind: "user", subjectId: "subject-a" }),
        resolveCapability: async () => ({ access: "authenticated", effect: "query", outputType: "object" }),
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
    let descriptor: {
        access: "public" | "authenticated" | "admin";
        effect: "query" | "command";
        outputType: string;
    } = {
        access: "public",
        effect: "command",
        outputType: "object",
    };
    const handler = createCapabilityQueryHandler({
        basePath: "",
        siteId: "site-a",
        invoker: invoker(calls),
        resolveActor: async () => ({ kind: "anonymous" }),
        resolveCapability: async () => descriptor,
    });

    expect((await handler(new Request("http://site/.cms/query/catalog/item.list"))).status).toBe(404);
    descriptor = { access: "public", effect: "query", outputType: "binary" };
    expect((await handler(new Request("http://site/.cms/query/catalog/item.list"))).status).toBe(404);
    descriptor = { access: "public", effect: "query", outputType: "object" };
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

test("logical Page mutations invoke structured commands by capability identity", async () => {
    const calls: GatewayInvocation[] = [];
    const successes: { contractId: string; capabilityId: string }[] = [];
    const handler = createCapabilityMutationHandler({
        basePath: "",
        siteId: "site-a",
        invoker: invoker(calls),
        resolveActor: async () => ({ kind: "administrator", subjectId: "subject-a" }),
        resolveCapability: async () => ({
            access: "admin",
            effect: "command",
            idempotency: "none",
            outputType: "object",
        }),
        onSuccess: (target) => successes.push(target),
    });

    const response = await handler(
        new Request("http://site/.cms/mutation/catalog/item.create", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-ulvia-automatic-idempotency-key": "ignored-for-non-keyed-command",
            },
            body: '{"title":"One"}',
        }),
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([
        expect.objectContaining({
            actor: { kind: "administrator", subjectId: "subject-a" },
            contractId: "catalog",
            capabilityId: "item.create",
            input: { title: "One" },
        }),
    ]);
    expect(successes).toEqual([{ contractId: "catalog", capabilityId: "item.create" }]);
});

test("logical keyed mutations require and forward their automatic idempotency key", async () => {
    const calls: GatewayInvocation[] = [];
    const handler = createCapabilityMutationHandler({
        basePath: "",
        siteId: "site-a",
        invoker: invoker(calls),
        resolveActor: async () => ({ kind: "anonymous" }),
        resolveCapability: async () => ({
            access: "public",
            effect: "command",
            idempotency: "keyed",
            outputType: "object",
        }),
    });

    const missing = await handler(
        new Request("http://site/.cms/mutation/catalog/item.create", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        }),
    );
    const accepted = await handler(
        new Request("http://site/.cms/mutation/catalog/item.create", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-ulvia-automatic-idempotency-key": "request-key",
            },
            body: "{}",
        }),
    );

    expect(missing.status).toBe(400);
    expect(accepted.status).toBe(200);
    expect(calls[0]).toMatchObject({ idempotencyKey: "request-key" });
});

function invoker(calls: GatewayInvocation[]) {
    return {
        resolveHttp: async () =>
            ({
                capability: {
                    id: "item.list",
                    behavior: { effect: "command", execution: "sync", idempotency: "natural" },
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
