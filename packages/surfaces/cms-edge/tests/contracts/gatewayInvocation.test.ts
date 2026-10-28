import { handlerContract } from "../../../../features/cms-gateway/tests/http/handlerContract.fixture";
import { expect, test } from "bun:test";
import { createContentReader, InMemoryContentRepository } from "@bernouy/cms-content";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { TtlCache } from "@bernouy/http-runner";
import EdgeCms from "cms-edge/EdgeCms";
import { CaptureRunner } from "../gateway/support/CaptureRunner";
import { NOOP_LOGGER } from "@bernouy/logging";

test("Edge mounts every gateway binding method and supplies trusted actor state", async () => {
    const calls: GatewayInvocation[] = [];
    const runner = new CaptureRunner();
    const content = createContentReader(new InMemoryContentRepository());
    new EdgeCms({
        runner,
        resourceHandler: async () => new Response(null, { status: 404 }),
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
        capabilityId: "item.create",
        actor: { kind: "provider", installationId: "install-caller" },
        input: { term: "one" },
    });
    const query = await runner.defaultHandler(
        "QUERY",
        "/.cms/call",
    )(
        new Request("http://site/.cms/call/catalog/v1/items", {
            method: "QUERY",
            headers: { authorization: "Bearer provider-token", "content-type": "application/json" },
            body: '{"term":"two"}',
        }),
    );
    expect(query.status).toBe(200);
    expect(calls[1]).toMatchObject({
        actor: { kind: "provider", installationId: "install-caller" },
        input: { term: "two" },
    });
    for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT", "QUERY"]) {
        expect(() => runner.defaultHandler(method, "/.cms/call")).not.toThrow();
    }
});

function invoker(calls: GatewayInvocation[]) {
    return {
        resolveContract: handlerContract,
        invoke: async (invocation: GatewayInvocation) => {
            calls.push(invocation);
            return { kind: "success" as const, status: 200, requestId: "request-1", output: { items: ["one"] } };
        },
    };
}
