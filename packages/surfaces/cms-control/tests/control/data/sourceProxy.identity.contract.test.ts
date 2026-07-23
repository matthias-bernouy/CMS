import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import type { Middleware, RouteHandler, Runner } from "@bernouy/http-runner";
import { mountControlSourceProxy } from "cms-control/core/admin/control/sourceProxy";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import type { CMS_ROLES } from "types/roles";

describe("Control source proxy identity contract", () => {
    test.each([
        ["GET", "mySeller"],
        ["POST", "registerMySeller"],
    ] as const)("forwards the configured identity service to %s %s", async (method, endpointName) => {
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:commerce",
            endpoints: [
                {
                    urn: `urn:commerce:${endpointName}`,
                    method,
                    targetUrl: "https://commerce.example/me/seller",
                    headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                    effects: { identityBindings: [{ kind: "user", responsePath: "id" }] },
                    output: [
                        {
                            status: "200",
                            body: {
                                type: "object",
                                properties: {
                                    id: {
                                        type: "number",
                                        semantic: { kind: "user-id", authority: "commerce" },
                                    },
                                },
                            },
                        },
                    ],
                },
            ],
        });
        const identities = new InMemoryIdentityService();
        const mounted = captureSourceHandlers();
        mountControlSourceProxy(
            {
                runner: mounted.runner,
                sources,
                auth: new InMemoryAuthentication<CMS_ROLES>({ role: "admin", identifier: "subject-seller" }),
                roles: new InMemoryRolesRepository(),
                secrets: new InMemorySecretStore(),
                identities,
            } as unknown as ControlCmsState,
            (async (_request, next) => next()) satisfies Middleware,
            undefined,
        );
        let upstreamCalls = 0;
        const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () => {
            upstreamCalls += 1;
            return Response.json({ id: 184 });
        }) as unknown as typeof fetch);

        try {
            const response = await mounted.handler(method)(
                new Request(`http://control/.cms/sources/commerce/${endpointName}`, { method }),
            );

            expect(response.status).toBe(200);
            expect(upstreamCalls).toBe(1);
            expect(await identities.resolve({ authority: "commerce", kind: "user", value: 184 }, "cms")).toBe(
                "subject-seller",
            );
        } finally {
            fetchSpy.mockRestore();
        }
    });
});

function captureSourceHandlers() {
    const handlers = new Map<string, RouteHandler>();
    const runner = {
        basePath: "/",
        group: (_prefix, mount) =>
            mount({
                setDefaultEndpoint: (method: Parameters<Runner["setDefaultEndpoint"]>[0], handler: RouteHandler) => {
                    handlers.set(method, handler);
                },
            } as unknown as Runner),
    } as Runner;
    return {
        runner,
        handler(method: string): RouteHandler {
            const handler = handlers.get(method);
            if (!handler) {
                throw new Error(`missing ${method} source handler`);
            }
            return handler;
        },
    };
}
