import { describe, expect, test } from "bun:test";
import {
    SourceOverlaySchemaCache,
    SourceOverlaySourceRepository,
    handleSourceRequest,
    materializeSourceOverlays,
} from "@bernouy/cms-sources";
import {
    baseEndpoint,
    cacheHarness,
    dynamicOverlay,
    enrichedEndpoint,
    fieldsResponse,
    invalidatingEndpoint,
} from "./helpers/sourceOverlaySchemaCacheFixtures";

describe("source overlay schema cache", () => {
    test("shares one cache across wrappers without crossing overlay repositories", async () => {
        const harness = await cacheHarness();

        const first = new SourceOverlaySourceRepository(harness.inner, harness.overlays, harness.options);
        const second = new SourceOverlaySourceRepository(harness.inner, harness.overlays, harness.options);

        expect(await first.getEndpoint("urn:accounts:getAccount")).toEqual(enrichedEndpoint("Company"));
        expect(await second.getEndpoint("urn:accounts:getAccount")).toEqual(enrichedEndpoint("Company"));
        expect(harness.probe.count("/fields")).toBe(1);

        const isolated = await cacheHarness(async () => fieldsResponse("Other installation"));
        const isolatedRepository = new SourceOverlaySourceRepository(
            isolated.inner,
            isolated.overlays,
            isolated.options,
        );
        expect(await isolatedRepository.getEndpoint("urn:accounts:getAccount")).toEqual(
            enrichedEndpoint("Other installation"),
        );
        expect(isolated.probe.count("/fields")).toBe(1);
    });

    test("honors TTL and returns defensive clones through an explicit dashboard cache", async () => {
        let now = 1_000;
        const cache = new SourceOverlaySchemaCache({ ttlMs: 50, now: () => now });
        const harness = await cacheHarness();
        const source = (await harness.inner.getSource("urn:accounts"))!;
        const overlays = await harness.overlays.getAllOverlays();

        const first = await materializeSourceOverlays(source, overlays, harness.options.deps, cache);
        first[0]!.fields[0]!.label = "Mutated caller value";
        const cached = await materializeSourceOverlays(source, overlays, harness.options.deps, cache);

        expect(cached[0]!.fields[0]!.label).toBe("Company");
        expect(harness.probe.count("/fields")).toBe(1);
        now += 50;
        await materializeSourceOverlays(source, overlays, harness.options.deps, cache);
        expect(harness.probe.count("/fields")).toBe(2);
    });

    test("does not retain failed materializations", async () => {
        let attempt = 0;
        const harness = await cacheHarness(async () => {
            attempt += 1;
            return attempt === 1 ? new Response("unavailable", { status: 503 }) : fieldsResponse("Recovered company");
        });
        const repository = new SourceOverlaySourceRepository(harness.inner, harness.overlays, harness.options);

        expect(await repository.getEndpoint("urn:accounts:getAccount")).toEqual(baseEndpoint);
        expect(await repository.getEndpoint("urn:accounts:getAccount")).toEqual(enrichedEndpoint("Recovered company"));
        expect(await repository.getEndpoint("urn:accounts:getAccount")).toEqual(enrichedEndpoint("Recovered company"));
        expect(harness.probe.count("/fields")).toBe(2);
    });

    test("applies scoped invalidation across caches configured for the same overlays", async () => {
        const harness = await cacheHarness();
        const repository = new SourceOverlaySourceRepository(harness.inner, harness.overlays, harness.options);
        const longLived = new SourceOverlaySourceRepository(harness.inner, harness.overlays, {
            ...harness.options,
            schemaCacheTtlMs: 120_000,
        });

        await repository.getEndpoint("urn:accounts:getAccount");
        await longLived.getEndpoint("urn:accounts:getAccount");
        repository.invalidateOverlaySchemas({ sourceId: "accounts", overlayId: "account-fields" });
        await longLived.getEndpoint("urn:accounts:getAccount");

        expect(harness.probe.count("/fields")).toBe(3);
    });

    test("keeps the cached schema after a non-2xx invalidating response", async () => {
        let label = "Cached company";
        const harness = await cacheHarness(async (request) => {
            if (new URL(request.url).pathname === "/refresh-schema") {
                label = "Unpublished company";
                return Response.json({ error: "unavailable" }, { status: 503 });
            }
            return fieldsResponse(label);
        });
        const source = (await harness.inner.getSource("urn:accounts"))!;
        source.endpoints.push(invalidatingEndpoint);
        await harness.inner.updateSource(source);
        const repository = new SourceOverlaySourceRepository(harness.inner, harness.overlays, harness.options);

        expect(await repository.getEndpoint(baseEndpoint.urn)).toEqual(enrichedEndpoint("Cached company"));
        const response = await handleSourceRequest(
            repository,
            new Request("http://cms.local/.cms/sources/accounts/refreshSchema", { method: "POST" }),
            { prefix: "/.cms/sources/", deps: { fetchImpl: harness.probe.fetchImpl } },
        );
        expect(response.status).toBe(503);
        expect(await repository.getEndpoint(baseEndpoint.urn)).toEqual(enrichedEndpoint("Cached company"));
        expect(harness.probe.count("/refresh-schema")).toBe(1);
        expect(harness.probe.count("/fields")).toBe(1);
    });

    test("invalidates after dispatch and before response interceptors continue", async () => {
        let label = "Legacy company";
        const harness = await cacheHarness(async (request) => {
            if (new URL(request.url).pathname === "/refresh-schema") {
                label = "Fresh company";
                return Response.json({ ok: true });
            }
            return fieldsResponse(label);
        });
        const source = (await harness.inner.getSource("urn:accounts"))!;
        source.endpoints.push({ ...invalidatingEndpoint, output: [{ status: "200", body: { type: "object" } }] });
        await harness.inner.updateSource(source);
        const repository = new SourceOverlaySourceRepository(harness.inner, harness.overlays, harness.options);
        expect(await repository.getEndpoint(baseEndpoint.urn)).toEqual(enrichedEndpoint("Legacy company"));
        let interceptedSchema: unknown;

        await handleSourceRequest(
            repository,
            new Request("http://cms.local/.cms/sources/accounts/refreshSchema", { method: "POST" }),
            {
                prefix: "/.cms/sources/",
                deps: {
                    fetchImpl: harness.probe.fetchImpl,
                    interceptEndpoint: async (_endpoint, request, next) => {
                        const response = await next(request);
                        interceptedSchema = await repository.getEndpoint(baseEndpoint.urn);
                        return response;
                    },
                },
            },
        );

        expect(interceptedSchema).toEqual(enrichedEndpoint("Fresh company"));
        expect(harness.probe.count("/fields")).toBe(2);
    });

    test("uses source and overlay fingerprints as cache revisions", async () => {
        const harness = await cacheHarness();
        const repository = new SourceOverlaySourceRepository(harness.inner, harness.overlays, harness.options);
        await repository.getEndpoint("urn:accounts:getAccount");

        await harness.overlays.upsertOverlay({ ...dynamicOverlay, label: "Updated overlay" });
        await repository.getEndpoint("urn:accounts:getAccount");
        const source = (await harness.inner.getSource("urn:accounts"))!;
        source.endpoints[1]!.targetUrl = "https://api.example.com/fields-v2";
        await harness.inner.updateSource(source);
        await repository.getEndpoint("urn:accounts:getAccount");

        expect(harness.probe.observations.map((entry) => new URL(entry.url).pathname)).toEqual([
            "/fields",
            "/fields",
            "/fields-v2",
        ]);
    });

    test("does not cache schemas produced from per-user computed context", async () => {
        const harness = await cacheHarness(async (request) =>
            fieldsResponse(new URL(request.url).searchParams.get("user") ?? "missing"),
        );
        const source = (await harness.inner.getSource("urn:accounts"))!;
        source.endpoints[1]!.input = {
            params: [
                {
                    name: "user",
                    in: "query",
                    source: { from: "computed", ref: "userID" },
                    schema: { type: "string" },
                },
            ],
        };
        await harness.inner.updateSource(source);
        let userID = "first-user";
        const repository = new SourceOverlaySourceRepository(harness.inner, harness.overlays, {
            deps: { ...harness.options.deps, resolveContext: async () => ({ userID }) },
        });

        expect(await repository.getEndpoint("urn:accounts:getAccount")).toEqual(enrichedEndpoint("first-user"));
        userID = "second-user";
        expect(await repository.getEndpoint("urn:accounts:getAccount")).toEqual(enrichedEndpoint("second-user"));
        expect(harness.probe.count("/fields")).toBe(2);
    });
});
