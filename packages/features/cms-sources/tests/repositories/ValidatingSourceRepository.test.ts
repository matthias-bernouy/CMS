import { describe, test, expect } from "bun:test";
import { ValidatingSourceRepository } from "cms-sources/core/repositories/ValidatingSourceRepository";
import { InMemorySourceRepository } from "cms-sources/default-implementation/InMemorySourceRepository";
import { SourceValidationError } from "cms-sources/core/model/errors";
import type { Source } from "cms-sources/interfaces/Source";

const valid = (): Source => ({
    urn: "urn:shop",
    meta: { name: "Shop" },
    endpoints: [
        {
            urn: "urn:shop:getCart",
            method: "GET",
            targetUrl: "https://api.shop.com/cart",
            output: [{ status: "200", body: { type: "object" } }],
        },
    ],
});

const repo = () => new ValidatingSourceRepository(new InMemorySourceRepository());

describe("ValidatingSourceRepository", () => {
    test("valid create delegates and persists", async () => {
        const r = repo();
        await r.createSource(valid());
        expect((await r.getSource("urn:shop"))?.endpoints).toHaveLength(1);
    });

    test("invalid create rejects with SourceValidationError (.status 400), nothing stored", async () => {
        const r = repo();
        const bad = {
            ...valid(),
            endpoints: [{ urn: "urn:other:x", method: "GET" as const, targetUrl: "https://x.com" }],
        };
        await expect(r.createSource(bad)).rejects.toBeInstanceOf(SourceValidationError);
        await expect(r.createSource(bad)).rejects.toMatchObject({ status: 400 });
        expect(await r.getSource("urn:shop")).toBeNull();
    });

    test("invalid update rejects — the rule is unbypassable on BOTH writes", async () => {
        const r = repo();
        await r.createSource(valid());
        const bad = {
            ...valid(),
            endpoints: [{ urn: "urn:shop:x", method: "FETCH" as any, targetUrl: "https://x.com" }],
        };
        await expect(r.updateSource(bad)).rejects.toBeInstanceOf(SourceValidationError);
    });

    test("valid update delegates (null for an unknown urn passes through)", async () => {
        const r = repo();
        expect(await r.updateSource(valid())).toBeNull();
        await r.createSource(valid());
        expect((await r.updateSource(valid()))?.urn).toBe("urn:shop");
    });

    test("reads and deletes pass straight through", async () => {
        const r = repo();
        await r.createSource(valid());
        expect(await r.getEndpoint("urn:shop:getCart")).not.toBeNull();
        expect(await r.getAllSources()).toHaveLength(1);
        expect(await r.deleteSource("urn:shop")).toBe(true);
        expect(await r.getAllSources()).toHaveLength(0);
    });
});
