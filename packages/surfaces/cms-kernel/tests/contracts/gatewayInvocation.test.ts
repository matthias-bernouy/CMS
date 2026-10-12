import { expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { GatewayError, type GatewayInvocation } from "@bernouy/cms-gateway";
import KernelCms from "cms-kernel/KernelCms";
import { handleCapabilityCall } from "cms-kernel/endpoints/capabilityCall.server";
import { CaptureRunner } from "../gateway/support/CaptureRunner";

test("Kernel mounts every gateway binding method and supplies trusted actor state", async () => {
    const calls: GatewayInvocation[] = [];
    const runner = new CaptureRunner();
    new KernelCms({
        runner,
        repository: new InMemoryCmsRepository(),
        authentication: new InMemoryAuthentication(),
        capabilityGateway: {
            siteId: "site-a",
            invoker: invoker(calls),
            authenticateProvider: async (token) => (token === "provider-token" ? "install-caller" : null),
            isAdministrator: async () => false,
        },
    });
    const response = await runner.defaultHandler(
        "POST",
        "/.cms/call",
    )(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { authorization: "Bearer provider-token", "content-type": "application/json" },
            body: '{"term":"one"}',
        }),
    );
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
        siteId: "site-a",
        contractId: "catalog",
        capabilityId: "item.list",
        origin: "provider",
        actor: { kind: "provider", installationId: "install-caller" },
        input: { term: "one" },
    });
    for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"]) {
        expect(() => runner.defaultHandler(method, "/.cms/call")).not.toThrow();
    }
});

test("Kernel authenticates provider machine calls independently from users", async () => {
    const calls: GatewayInvocation[] = [];
    const kernel = {
        runner: { basePath: "/" },
        capabilityGateway: {
            siteId: "site-a",
            authenticateProvider: async (token: string) =>
                token === "provider-secret-token" ? "install-caller" : null,
            invoker: invoker(calls),
        },
    } as unknown as KernelCms;
    const response = await handleCapabilityCall(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: {
                authorization: "Bearer provider-secret-token",
                "content-type": "application/json",
            },
            body: '{"term":"one"}',
        }),
        kernel,
    );
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
        origin: "provider",
        actor: { kind: "provider", installationId: "install-caller" },
    });
});

test("Kernel projects gateway authorization failures", async () => {
    const kernel = {
        runner: { basePath: "/" },
        capabilityGateway: {
            siteId: "site-a",
            authenticateProvider: async () => "install-caller",
            invoker: {
                ...invoker([]),
                invoke: async () => {
                    throw new GatewayError("not_authorized", "denied");
                },
            },
        },
    } as unknown as KernelCms;
    const denied = await handleCapabilityCall(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { authorization: "Bearer provider-token", "content-type": "application/json" },
            body: "{}",
        }),
        kernel,
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
