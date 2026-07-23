import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryAuthentication, type Subject } from "@bernouy/cms-auth";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    createSourceRequestTelemetryMiddleware,
    InMemorySourceRepository,
    type SourceRequestObservation,
} from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import type { Middleware, RouteHandler, Runner } from "@bernouy/http-runner";
import { createControlAccessGuard } from "cms-control/core/admin/control/adminAccess";
import { mountControlSourceProxy } from "cms-control/core/admin/control/sourceProxy";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import type { CMS_ROLES } from "types/roles";

describe("Control source subject scope", () => {
    test("shares one subject through guard, authorization, context, and a trigger", async () => {
        const authentication = new CountingAuthentication();
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:orders",
            endpoints: [
                {
                    urn: "urn:orders:create",
                    method: "POST",
                    access: { mode: "admin" },
                    targetUrl: "https://connector.example.test/orders",
                    headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        });
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction({ id: "audit", method: "POST", steps: [], return: {} });
        const triggers = new InMemoryTriggerRepository();
        await triggers.createTrigger({
            id: "audit-order",
            enabled: true,
            event: { kind: "endpoint", source: "orders", endpoint: "create", phase: "response" },
            mode: "sync",
            function: { id: "audit" },
        });
        const mounted = captureSourceHandler();
        const observations: SourceRequestObservation[] = [];
        const telemetry = {
            observe(observation: SourceRequestObservation) {
                observations.push(observation);
            },
        };
        const guard = createControlAccessGuard("", authentication);
        mountControlSourceProxy(
            {
                configuration: { sourceTelemetry: telemetry },
                runner: mounted.runner,
                sources,
                functions,
                triggers,
                auth: authentication,
                roles: new InMemoryRolesRepository(),
                secrets: new InMemorySecretStore(),
            } as unknown as ControlCmsState,
            guard,
            undefined,
        );
        const upstream = spyOn(globalThis, "fetch").mockImplementation((async (
            _input: RequestInfo | URL,
            init?: RequestInit,
        ) => {
            expect(new Headers(init?.headers).get("x-cms-user-id")).toBe("operator-1");
            return Response.json({ created: true });
        }) as unknown as typeof fetch);

        try {
            for (const expectedCalls of [1, 2]) {
                const request = new Request("http://control/.cms/sources/orders/create", { method: "POST" });
                const response = await createSourceRequestTelemetryMiddleware(telemetry)(request, () =>
                    guard(request, () => Promise.resolve(mounted.handler(request))),
                );

                expect(response.status).toBe(200);
                expect(authentication.calls).toBe(expectedCalls);
            }
            expect(upstream).toHaveBeenCalledTimes(2);
            expect((await triggers.getTrigger("audit-order"))?.lastRun?.status).toBe("ok");
            expect(observations).toHaveLength(2);
            expect(observations.every((observation) => observation.stagesMs.cms_auth !== undefined)).toBe(true);
        } finally {
            upstream.mockRestore();
        }
    });
});

class CountingAuthentication extends InMemoryAuthentication<CMS_ROLES> {
    calls = 0;

    constructor() {
        super({ identifier: "operator-1", role: "admin" });
    }

    override async getSubject(request: Request): Promise<Subject<CMS_ROLES>> {
        this.calls += 1;
        return super.getSubject(request);
    }
}

function captureSourceHandler(): { runner: Runner; handler: RouteHandler } {
    let handler: RouteHandler | undefined;
    const runner = {
        basePath: "/",
        group: (_prefix, mount) =>
            mount({
                setDefaultEndpoint: (method: Parameters<Runner["setDefaultEndpoint"]>[0], candidate: RouteHandler) => {
                    if (method === "POST") {
                        handler = candidate;
                    }
                },
            } as unknown as Runner),
    } as Runner;
    return {
        runner,
        handler(request) {
            if (!handler) {
                throw new Error("missing source handler");
            }
            return handler(request);
        },
    };
}
