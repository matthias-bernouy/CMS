import { describe, expect, spyOn, test } from "bun:test";
import { handleSourceRequest, runObservedSourceRequest, type SourceRequestObservation } from "@bernouy/cms-sources";
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
                        ...five(() => scope.proxiedSources!.getEndpoint("urn:catalog:read")),
                        ...five((index) => scope.deps.resolveSecret!(index % 2 === 0 ? "${API_KEY}" : "API_KEY")),
                        ...five(() =>
                            scope.deps.identities!.resolve(
                                { authority: "provider", kind: "user", value: "member-1" },
                                "cms",
                            ),
                        ),
                    ]);
                    return new Response("ok");
                },
            );

            expect(harness.counters).toEqual({
                sourceReads: 0,
                endpointReads: expectedReads,
                identityReads: expectedReads,
                secretReads: expectedReads,
            });
        }

        expect(observations).toHaveLength(2);
    });

    test("does no secret, identity, interceptor, or upstream work before authorization", async () => {
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
                identityReads: 0,
                secretReads: 0,
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
