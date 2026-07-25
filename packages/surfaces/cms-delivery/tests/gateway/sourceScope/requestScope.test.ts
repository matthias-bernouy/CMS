import { describe, expect, spyOn, test } from "bun:test";
import { handleSourceRequest, runObservedSourceRequest, type SourceRequestObservation } from "@bernouy/cms-sources";
import { InMemoryRolesRepository, PUBLIC_ROLE } from "@bernouy/cms-permissions";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { registerDeliverySourceProxy } from "cms-delivery/core/sources/registerSourceProxy";
import { CaptureRunner } from "../support/CaptureRunner";
import { requestScopeHarness } from "./requestScope.fixture";

describe("Delivery source dependency scope", () => {
    test("composes the configured image interceptor into each request scope", async () => {
        const harness = await requestScopeHarness();
        const events: string[] = [];
        Object.assign(harness.delivery, {
            sourceImageInterceptor: async (
                _endpoint: unknown,
                candidate: Request,
                next: (req: Request) => Promise<Response>,
            ) => {
                events.push("image:before");
                const response = await next(candidate);
                events.push("image:after");
                return response;
            },
        });
        const request = new Request("https://cms.test/.cms/sources/catalog/read");
        const scope = harness.scope(request);

        const response = await scope.interceptEndpoint!(harness.endpoint, request, async () => {
            events.push("dispatch");
            return new Response("ok");
        });

        expect(await response.text()).toBe("ok");
        expect(events).toEqual(["image:before", "dispatch", "image:after"]);
    });

    test("single-flights dependencies within one request and isolates the next request", async () => {
        const harness = await requestScopeHarness();
        const observations: SourceRequestObservation[] = [];

        for (const expectedReads of [1, 2]) {
            const request = new Request("https://cms.test/.cms/sources/catalog/read");
            await runObservedSourceRequest(
                request,
                {
                    uniformSampleRate: 1,
                    observe: (observation) => observations.push(observation),
                },
                async () => {
                    const scope = harness.scope(request);
                    await Promise.all([
                        ...five(() => scope.sources!.getEndpoint("urn:catalog:read")),
                        ...five(() => scope.functions!.getFunction("readCatalog")),
                        ...five((index) => scope.deps.resolveSecret!(index % 2 === 0 ? "${API_KEY}" : "API_KEY")),
                        ...five(() =>
                            scope.deps.identities!.resolve(
                                { authority: "provider", kind: "user", value: "member-1" },
                                "cms",
                            ),
                        ),
                        ...five(() =>
                            scope.interceptEndpoint!(harness.endpoint, request, async () => new Response("ok")),
                        ),
                    ]);
                    return new Response("ok");
                },
            );

            expect(harness.counters).toEqual({
                sourceReads: expectedReads,
                endpointReads: 0,
                overlayReads: expectedReads,
                functionReads: expectedReads,
                identityReads: expectedReads,
                secretReads: expectedReads,
                triggerReads: expectedReads,
            });
        }

        expect(observations).toHaveLength(2);
        expect(observations.every((item) => item.stagesMs.cms_source !== undefined)).toBe(true);
        expect(observations.every((item) => item.stagesMs.cms_overlays !== undefined)).toBe(true);
    });

    test("reuses the same graph for system function resolution and execution", async () => {
        const harness = await requestScopeHarness();
        const roles = new InMemoryRolesRepository();
        await roles.upsert({
            id: PUBLIC_ROLE,
            label: "Public",
            builtin: true,
            grants: [{ permission: "urn:system-functions:readCatalog" }],
        });
        const runner = new CaptureRunner();
        registerDeliverySourceProxy({
            ...harness.delivery,
            runner,
            roles,
        } as unknown as DeliveryCms);
        const handler = runner.defaultHandler("GET", "/.cms/sources");
        const upstream = spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer request-secret");
            return Response.json({ id: "item-1" });
        });

        try {
            for (const expectedRequests of [1, 2]) {
                const response = await handler(
                    new Request("https://cms.test/.cms/sources/system-functions/readCatalog"),
                );

                expect(response.status).toBe(200);
                expect(harness.counters).toEqual({
                    sourceReads: expectedRequests,
                    endpointReads: 0,
                    overlayReads: expectedRequests,
                    functionReads: expectedRequests,
                    identityReads: 0,
                    secretReads: expectedRequests,
                    triggerReads: expectedRequests,
                });
                expect(upstream).toHaveBeenCalledTimes(expectedRequests * 2);
            }
        } finally {
            upstream.mockRestore();
        }
    });

    test("does no overlay, secret, identity, trigger, or upstream work before authorization", async () => {
        const harness = await requestScopeHarness();
        const request = new Request("https://cms.test/.cms/sources/catalog/read");
        const upstream = spyOn(globalThis, "fetch").mockResolvedValue(new Response("unexpected"));
        let imageCalls = 0;
        Object.assign(harness.delivery, {
            sourceImageInterceptor: async (
                _endpoint: unknown,
                candidate: Request,
                next: (req: Request) => Promise<Response>,
            ) => {
                imageCalls++;
                return next(candidate);
            },
        });

        try {
            const response = await runObservedSourceRequest(request, {}, async () => {
                const scope = harness.scope(request);
                return handleSourceRequest(scope.proxiedSources, request, {
                    prefix: "/.cms/sources/",
                    deps: {
                        ...scope.deps,
                        authorizeEndpoint: () => false,
                        ...(scope.interceptEndpoint ? { interceptEndpoint: scope.interceptEndpoint } : {}),
                    },
                });
            });

            expect(response.status).toBe(403);
            expect(harness.counters).toEqual({
                sourceReads: 0,
                endpointReads: 1,
                overlayReads: 0,
                functionReads: 0,
                identityReads: 0,
                secretReads: 0,
                triggerReads: 0,
            });
            expect(upstream).not.toHaveBeenCalled();
            expect(imageCalls).toBe(0);
        } finally {
            upstream.mockRestore();
        }
    });
});

function five<Value>(operation: (index: number) => Promise<Value>): Promise<Value>[] {
    return Array.from({ length: 5 }, (_, index) => operation(index));
}
