import { describe, expect, test } from "bun:test";
import { CompositeSourceRepository } from "cms-sources/core/CompositeSourceRepository";
import { InMemorySourceRepository } from "cms-sources/default-implementation/InMemorySourceRepository";
import { SYSTEM_AUTH_SOURCE, SYSTEM_AUTH_SOURCE_URN } from "cms-sources/core/systemSources";
import type { Source } from "cms-sources/interfaces/Source";

const source = (urn = "urn:shop"): Source => ({
    urn,
    meta: { name: "Shop" },
    endpoints: [
        { urn: `${urn}:getCart`, method: "GET", targetUrl: "https://api.shop.com/cart" },
    ],
});

describe("CompositeSourceRepository", () => {
    test("lists system sources before persisted sources", async () => {
        const inner = new InMemorySourceRepository();
        await inner.createSource(source());
        const repo = new CompositeSourceRepository(inner, [SYSTEM_AUTH_SOURCE]);

        const sources = await repo.getAllSources();
        expect(sources.map(p => p.urn)).toEqual([SYSTEM_AUTH_SOURCE_URN, "urn:shop"]);
    });

    test("resolves system sources and endpoints without persisting them", async () => {
        const inner = new InMemorySourceRepository();
        const repo = new CompositeSourceRepository(inner, [SYSTEM_AUTH_SOURCE]);

        expect(await inner.getSource(SYSTEM_AUTH_SOURCE_URN)).toBeNull();
        expect((await repo.getSource(SYSTEM_AUTH_SOURCE_URN))?.meta?.name).toBe("Authentication");
        expect((await repo.getEndpoint("urn:system-auth:login"))?.targetUrl).toBe("cms-system://auth/login");
    });

    test("blocks writes in the reserved system namespace", async () => {
        const repo = new CompositeSourceRepository(new InMemorySourceRepository(), [SYSTEM_AUTH_SOURCE]);

        await expect(repo.createSource(source("urn:system-custom"))).rejects.toThrow(/reserved/);
        await expect(repo.updateSource(SYSTEM_AUTH_SOURCE)).rejects.toThrow(/readonly/);
        await expect(repo.deleteSource(SYSTEM_AUTH_SOURCE_URN)).rejects.toThrow(/readonly/);
    });

    test("filters legacy persisted system sources from read lists", async () => {
        const inner = new InMemorySourceRepository();
        await inner.createSource(source("urn:system-legacy"));
        const repo = new CompositeSourceRepository(inner, [SYSTEM_AUTH_SOURCE]);

        expect((await repo.getAllSources()).map(p => p.urn)).toEqual([SYSTEM_AUTH_SOURCE_URN]);
    });
});
