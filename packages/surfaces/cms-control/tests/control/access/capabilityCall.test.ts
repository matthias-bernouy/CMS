import { expect, test } from "bun:test";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { InMemoryDashboardAssignmentRepository, InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";
import {
    handleControlCapabilityCall,
    handleControlCapabilityFile,
    handleDashboardCapabilityCall,
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
    mountControlCapabilityRoutes({} as ControlCms, state, (_request, next) => next());
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

test("Control mounts authenticated provider file reads", async () => {
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
                        return {
                            kind: "binary",
                            requestId: "request-1",
                            status: 200,
                            contentType: "image/png",
                            bytes: new Uint8Array([7]),
                        };
                    },
                },
            },
        },
    } as unknown as ControlCmsState;
    mountControlCapabilityRoutes({} as ControlCms, state, (_request, next) => next());
    const handler = runner.handlers.get("GET /api/media");
    expect(handler).toBeDefined();
    const response = await handler!(new Request("http://control/api/media/files/file.read/photo-1"));
    expect(response.status).toBe(200);
    expect(await response.arrayBuffer()).toEqual(new Uint8Array([7]).buffer);
    expect(calls[0]).toMatchObject({
        actor: { kind: "administrator", subjectId: "cms-admin-1" },
        input: { fileId: "photo-1" },
    });
    state.auth.getSubject = async () => null;
    expect(
        (await handleControlCapabilityFile(new Request("http://control/api/media/files/file.read/photo-1"), state))
            .status,
    ).toBe(401);
});

test("Control mounts provider derivatives with its authenticated administrator", async () => {
    const calls: GatewayInvocation[] = [];
    const runner = new CaptureRunner();
    const state = {
        runner,
        auth: { getSubject: async () => ({ identifier: "cms-admin-1" }) },
        configuration: {
            capabilityGateway: {
                siteId: "site-a",
                isAdministrator: async () => true,
                invoker: { invoke: async () => ({ kind: "success", requestId: "unused", status: 200 }) },
                images: {
                    get: async (invocation: GatewayInvocation, width: number) => {
                        calls.push(invocation);
                        return { bytes: new Uint8Array([7]), etag: '"test"', width, height: 40 };
                    },
                },
            },
        },
    } as unknown as ControlCmsState;
    mountControlCapabilityRoutes({} as ControlCms, state, (_request, next) => next());
    const response = await runner.handlers.get("GET /api/image")!(
        new Request("http://control/api/image/files/file.read/photo-1/128.webp"),
    );
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
        siteId: "site-a",
        origin: "control",
        actor: { kind: "administrator", subjectId: "cms-admin-1" },
        input: { fileId: "photo-1" },
    });
});

test("a dashboard member can call only capabilities required by the selected view", async () => {
    const calls: GatewayInvocation[] = [];
    const dashboards = new InMemoryDashboardRepository();
    const assignments = new InMemoryDashboardAssignmentRepository();
    const collections = {
        snapshot: async () => ({
            revision: 1,
            collections: [
                {
                    collectionId: "test",
                    release: {
                        collectionId: "test",
                        blocs: [],
                        views: [
                            {
                                id: "catalog",
                                uses: [],
                                requires: [
                                    {
                                        contractId: "catalog.items",
                                        capabilityId: "item.list",
                                        versionRange: "^1.0.0",
                                    },
                                ],
                            },
                        ],
                    },
                },
            ],
        }),
    };
    await dashboards.create({
        id: "workspace",
        siteId: "site-a",
        name: "Workspace",
        enabled: true,
        revision: 0,
        navigation: [{ id: "catalog", label: "Catalog", use: "test:catalog" }],
    });
    await assignments.assign({ dashboardId: "workspace", subjectId: "member-1" });
    const state = {
        runner: { basePath: "/" },
        auth: { getSubject: async () => ({ identifier: "member-1" }) },
        dashboardAssignments: assignments,
        configuration: {
            collections: { siteId: "site-a", store: collections },
            capabilityGateway: {
                siteId: "site-a",
                isAdministrator: async () => false,
                invoker: {
                    invoke: async (invocation: GatewayInvocation) => {
                        calls.push(invocation);
                        return { kind: "success", requestId: "request-1", status: 200, output: { items: [] } };
                    },
                },
            },
        },
    } as unknown as ControlCmsState;
    const cms = {
        auth: state.auth,
        config: state.configuration,
        dashboards,
        dashboardAssignments: assignments,
    } as unknown as ControlCms;
    const request = (contract: string) =>
        new Request(
            `http://control/api/dashboard-call/${contract}/item.list?dashboardId=workspace&viewId=test%3Acatalog`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
            },
        );

    expect((await handleDashboardCapabilityCall(request("catalog.items"), cms, state)).status).toBe(200);
    expect(calls[0]).toMatchObject({
        origin: "view",
        actor: { kind: "user", subjectId: "member-1" },
        contractId: "catalog.items",
    });
    expect((await handleDashboardCapabilityCall(request("forms.submissions"), cms, state)).status).toBe(403);
    expect(calls).toHaveLength(1);
});
