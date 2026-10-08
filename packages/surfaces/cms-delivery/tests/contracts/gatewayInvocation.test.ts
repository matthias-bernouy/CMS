import { expect, test } from "bun:test";
import { GatewayError, type GatewayInvocation } from "@bernouy/cms-gateway";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { handleCapabilityCall } from "cms-delivery/endpoints/capabilityCall.server";
import { CaptureRunner } from "../gateway/support/CaptureRunner";

test("Delivery mounts every gateway binding method and supplies trusted actor state", async () => {
    const calls: GatewayInvocation[] = [];
    const runner = new CaptureRunner();
    new DeliveryCms({
        runner,
        repository: {} as never,
        capabilityGateway: {
            siteId: "site-a",
            invoker: invoker(calls),
        },
    });
    const response = await runner.defaultHandler(
        "POST",
        "/.cms/call",
    )(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"term":"one"}',
        }),
    );
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
        siteId: "site-a",
        contractId: "catalog",
        capabilityId: "item.list",
        origin: "delivery",
        actor: { kind: "anonymous" },
        input: { term: "one" },
    });
    for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"]) {
        expect(() => runner.defaultHandler(method, "/.cms/call")).not.toThrow();
    }
});

test("Delivery authenticates provider machine calls independently from users", async () => {
    const calls: GatewayInvocation[] = [];
    const delivery = {
        basePath: "",
        auth: { subject: async () => ({ identifier: "cms-user-1" }) },
        capabilityGateway: {
            siteId: "site-a",
            authenticateProvider: async (token: string) =>
                token === "provider-secret-token" ? "install-caller" : null,
            invoker: invoker(calls),
        },
    } as unknown as DeliveryCms;
    const response = await handleCapabilityCall(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: {
                authorization: "Bearer provider-secret-token",
                "content-type": "application/json",
            },
            body: '{"term":"one"}',
        }),
        delivery,
    );
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
        origin: "provider",
        actor: { kind: "provider", installationId: "install-caller" },
    });
});

test("Delivery projects gateway authorization failures", async () => {
    const delivery = {
        basePath: "",
        auth: { subject: async () => ({ identifier: "cms-user-1" }) },
        capabilityGateway: {
            siteId: "site-a",
            invoker: {
                ...invoker([]),
                invoke: async () => {
                    throw new GatewayError("not_authorized", "denied");
                },
            },
        },
    } as unknown as DeliveryCms;
    const denied = await handleCapabilityCall(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        }),
        delivery,
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
