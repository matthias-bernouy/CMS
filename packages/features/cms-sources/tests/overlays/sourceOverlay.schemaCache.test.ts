import { describe, expect, test } from "bun:test";
import {
    SourceOverlaySchemaCache,
    SourceOverlaySourceRepository,
    materializeSourceOverlays,
} from "@bernouy/cms-sources";
import {
    baseEndpoint,
    cacheHarness,
    enrichedEndpoint,
    fieldsResponse,
} from "../helpers/sourceOverlaySchemaCacheFixtures";

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
});
