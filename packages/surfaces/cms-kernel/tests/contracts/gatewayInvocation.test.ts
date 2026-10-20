import { expect, test } from "bun:test";
import { createContentReader, InMemoryCmsRepository } from "@bernouy/cms-content";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { TtlCache } from "@bernouy/http-runner";
import KernelCms from "cms-kernel/KernelCms";
import { CaptureRunner } from "../gateway/support/CaptureRunner";
import { NOOP_LOGGER } from "@bernouy/logging";

test("Kernel mounts every gateway binding method and supplies trusted actor state", async () => {
    const calls: GatewayInvocation[] = [];
    const runner = new CaptureRunner();
    new KernelCms({
        runner,
        cache: new TtlCache(),
        content: createContentReader(new InMemoryCmsRepository()),
        resolveActor: async () => ({ kind: "anonymous" }),
        logger: NOOP_LOGGER,
        capabilityGateway: {
            siteId: "site-a",
            invoker: invoker(calls),
            authenticateProvider: async (token) => (token === "provider-token" ? "install-caller" : null),
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
        actor: { kind: "provider", installationId: "install-caller" },
        input: { term: "one" },
    });
    for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"]) {
        expect(() => runner.defaultHandler(method, "/.cms/call")).not.toThrow();
    }
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
