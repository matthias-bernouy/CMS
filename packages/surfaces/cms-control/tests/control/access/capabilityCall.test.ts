import { expect, test } from "bun:test";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import {
    handleControlCapabilityCall,
    mountControlCapabilityRoutes,
} from "cms-control/core/admin/control/mountRoutes/capability";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import { CaptureRunner } from "./authPublicSupport";

test("Control mounts a separate capability route with verified administrator identity", async () => {
    const calls: GatewayInvocation[] = [];
    const runner = new CaptureRunner();
    const state = {
        runner,
        auth: { getSubject: async () => ({ identifier: "cms-admin-1" }) },
        configuration: {
            capabilityGateway: {
                siteId: "site-a",
                isAdministrator: async () => true,
                invoker: {
                    invoke: async (invocation: GatewayInvocation) => {
                        calls.push(invocation);
                        return { kind: "success", requestId: "request-1", status: 200, output: { ok: true } };
                    },
                },
            },
        },
    } as unknown as ControlCmsState;
    mountControlCapabilityRoutes(state, (_request, next) => next());
    const handler = runner.handlers.get("POST /api/call");
    expect(handler).toBeDefined();
    const response = await handler!(
        new Request("http://control/api/call/catalog/item.list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        }),
    );
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
        origin: "control",
        siteId: "site-a",
        actor: { kind: "administrator", subjectId: "cms-admin-1" },
    });
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
        new Request("http://control/api/call/catalog/item.list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
        }),
        state,
    );
    expect(response.status).toBe(401);
    expect(calls).toBe(0);
});
