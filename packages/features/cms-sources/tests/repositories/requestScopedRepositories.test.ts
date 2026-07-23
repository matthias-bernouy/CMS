import { describe, expect, test } from "bun:test";
import { InMemorySourceOverlayRepository, InMemorySourceRepository, type Source } from "@bernouy/cms-sources";
import { RequestScopedSourceOverlayRepository, RequestScopedSourceRepository } from "@bernouy/cms-sources/requestScope";

const source = (): Source => ({
    urn: "urn:shop",
    meta: { name: "Shop" },
    endpoints: [{ urn: "urn:shop:list", method: "GET", targetUrl: "https://example.test/items" }],
});

describe("request-scoped source repositories", () => {
    test("single-flights reads, caches null, and returns defensive clones", async () => {
        const inner = new CountingSourceRepository();
        await inner.createSource(source());
        const scoped = new RequestScopedSourceRepository(inner);

        const reads = await Promise.all(Array.from({ length: 5 }, () => scoped.getSource("urn:shop")));
        reads[0]!.meta!.name = "mutated";
        expect((await scoped.getSource("urn:shop"))!.meta!.name).toBe("Shop");
        expect(inner.sourceReads).toBe(1);

        await Promise.all([scoped.getSource("urn:missing"), scoped.getSource("urn:missing")]);
        expect(inner.sourceReads).toBe(2);
        await new RequestScopedSourceRepository(inner).getSource("urn:shop");
        expect(inner.sourceReads).toBe(3);
    });

    test("evicts rejected reads and keeps authorization and enriched lookups separate", async () => {
        const inner = new CountingSourceRepository();
        await inner.createSource(source());
        inner.rejectSourceOnce = true;
        const scoped = new RequestScopedSourceRepository(inner);

        await expect(scoped.getSource("urn:shop")).rejects.toThrow("transient");
        expect((await scoped.getSource("urn:shop"))?.urn).toBe("urn:shop");
        await Promise.all([
            scoped.getEndpointForAuthorization("urn:shop:list"),
            scoped.getEndpointForAuthorization("urn:shop:list"),
        ]);
        await scoped.getEndpoint("urn:shop:list");

        expect(inner.sourceReads).toBe(2);
        expect(inner.endpointReads).toBe(2);
    });

    test("shares overlays by source and invalidates the request snapshot after writes", async () => {
        const inner = new CountingOverlayRepository();
        await inner.upsertOverlay({
            id: "catalog",
            sourceId: "shop",
            fields: [{ id: "label", label: "Label", type: "string" }],
        });
        const scoped = new RequestScopedSourceOverlayRepository(inner);

        const reads = await Promise.all(Array.from({ length: 5 }, () => scoped.getOverlaysForSource("shop")));
        reads[0]![0]!.fields[0]!.label = "mutated";
        expect((await scoped.getOverlaysForSource("shop"))[0]!.fields[0]!.label).toBe("Label");
        expect(inner.sourceReads).toBe(1);

        await scoped.upsertOverlay({
            id: "catalog",
            sourceId: "shop",
            fields: [{ id: "label", label: "Updated", type: "string" }],
        });
        expect((await scoped.getOverlaysForSource("shop"))[0]!.fields[0]!.label).toBe("Updated");
        expect(inner.sourceReads).toBe(2);
    });
});

class CountingSourceRepository extends InMemorySourceRepository {
    sourceReads = 0;
    endpointReads = 0;
    rejectSourceOnce = false;

    override async getSource(urn: string) {
        this.sourceReads++;
        if (this.rejectSourceOnce) {
            this.rejectSourceOnce = false;
            throw new Error("transient");
        }
        return super.getSource(urn);
    }

    override async getEndpoint(urn: string) {
        this.endpointReads++;
        return super.getEndpoint(urn);
    }
}

class CountingOverlayRepository extends InMemorySourceOverlayRepository {
    sourceReads = 0;

    override async getOverlaysForSource(sourceId: string) {
        this.sourceReads++;
        return super.getOverlaysForSource(sourceId);
    }
}
