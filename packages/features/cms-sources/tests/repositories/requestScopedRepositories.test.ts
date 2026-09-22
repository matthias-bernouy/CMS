import { describe, expect, test } from "bun:test";
import { InMemorySourceRepository, type Source } from "@bernouy/cms-sources";
import { RequestScopedSourceRepository } from "@bernouy/cms-sources/requestScope";

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

    test("evicts rejected reads and single-flights endpoint reads", async () => {
        const inner = new CountingSourceRepository();
        await inner.createSource(source());
        inner.rejectSourceOnce = true;
        const scoped = new RequestScopedSourceRepository(inner);

        await expect(scoped.getSource("urn:shop")).rejects.toThrow("transient");
        expect((await scoped.getSource("urn:shop"))?.urn).toBe("urn:shop");
        await Promise.all([scoped.getEndpoint("urn:shop:list"), scoped.getEndpoint("urn:shop:list")]);

        expect(inner.sourceReads).toBe(2);
        expect(inner.endpointReads).toBe(1);
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
