import { describe, expect, test } from "bun:test";
import { SourceOverlaySourceRepository, handleSourceRequest } from "@bernouy/cms-sources";
import {
    baseEndpoint,
    cacheHarness,
    dynamicOverlay,
    enrichedEndpoint,
    fieldsResponse,
    invalidatingEndpoint,
} from "../helpers/sourceOverlaySchemaCacheFixtures";

describe("source overlay schema cache invalidation", () => {
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
