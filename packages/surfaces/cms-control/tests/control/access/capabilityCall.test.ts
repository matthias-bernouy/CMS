import { expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import {
    handleControlCapabilityCall,
    mountControlCapabilityRoutes,
} from "cms-control/core/admin/control/mountRoutes/capability";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import { CaptureRunner } from "./authPublicSupport";
import { controlPageCollections } from "./security/collectionPageFixture";

test("Control mounts a separate capability route with verified administrator identity", async () => {
    const calls: GatewayInvocation[] = [];
    const runner = new CaptureRunner();
    const state = {
        runner,
        repository: new InMemoryCmsRepository(),
        auth: { getSubject: async () => ({ identifier: "cms-admin-1" }) },
        configuration: {
            collections: await controlPageCollections(),
            capabilityGateway: {
                siteId: "site-a",
                isAdministrator: async () => true,
                pageExecutions: {
                    activate: async () => ({}),
                    authorize: async () => ({
                        planDigest: `sha256:${"a".repeat(64)}`,
                        version: "1.0.0",
                        digest: `sha256:${"b".repeat(64)}`,
                        installationId: "provider-1",
                    }),
                },
                invoker: {
                    resolveHttp: async () => ({
                        capability: { id: "item.list" },
                        binding: {
                            method: "POST",
                            path: "/v1/items",
                            pathParameters: [],
                            query: [],
                            headers: [],
                            body: { kind: "json", properties: ["term"], contentTypes: ["application/json"] },
                        },
                        pathValues: {},
                    }),
                    invoke: async (invocation: GatewayInvocation) => {
                        calls.push(invocation);
                        return { kind: "success", requestId: "request-1", status: 200, output: { ok: true } };
                    },
                },
            },
        },
    } as unknown as ControlCmsState;
    mountControlCapabilityRoutes(state, [(_request, next) => next()]);
    const handler = runner.handlers.get("POST /.cms/call");
    expect(handler).toBeDefined();
    const response = await handler!(
        new Request("http://control/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { "content-type": "application/json", referer: "http://control/admin" },
            body: "{}",
        }),
    );
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
        origin: "page",
        siteId: "site-a",
        actor: { kind: "administrator", subjectId: "cms-admin-1" },
    });
    const crossSite = await handler!(
        new Request("http://control/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { "content-type": "application/json", referer: "https://attacker.example/admin" },
            body: "{}",
        }),
    );
    expect(crossSite.status).toBe(403);
    expect(calls).toHaveLength(1);
});

test("Control refuses unauthenticated capability calls before invocation", async () => {
    let calls = 0;
    const state = {
        runner: { basePath: "/" },
        auth: { getSubject: async () => null },
        configuration: {
            capabilityGateway: {
                siteId: "site-a",
                isAdministrator: async () => true,
                invoker: {
                    invoke: async () => {
                        calls += 1;
                        throw new Error("unexpected call");
                    },
                },
            },
        },
    } as unknown as ControlCmsState;
    const response = await handleControlCapabilityCall(
        new Request("http://control/.cms/call/catalog/v1/items", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        }),
        state,
    );
    expect(response.status).toBe(401);
    expect(calls).toBe(0);
});
