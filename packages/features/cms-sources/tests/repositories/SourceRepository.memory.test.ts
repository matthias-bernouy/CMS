import { describe, test, expect } from "bun:test";
import { InMemorySourceRepository } from "cms-sources/default-implementation/InMemorySourceRepository";
import { DuplicateSourceError } from "cms-sources/core/model/errors";
import type { Source } from "cms-sources/interfaces/Source";

const source = (): Source => ({
    urn: "urn:shop",
    meta: { name: "Shop" },
    endpoints: [{ urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" }],
});

/** Same urn as `source()`, but two endpoints and no `meta` — for full-replace tests. */
const sourceTwoEndpoints = (): Source => ({
    urn: "urn:shop",
    endpoints: [
        { urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" },
        { urn: "urn:shop:addItem", method: "POST", targetUrl: "https://api.shop.com/cart/items" },
    ],
});

describe("InMemorySourceRepository", () => {
    test("create + getSource", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource(source());
        const p = await r.getSource("urn:shop");
        expect(p?.urn).toBe("urn:shop");
        expect(p?.endpoints).toHaveLength(1);
    });

    test("rejects a duplicate urn", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource(source());
        await expect(r.createSource(source())).rejects.toThrow(/already exists/);
        await expect(r.createSource(source())).rejects.toBeInstanceOf(DuplicateSourceError);
    });

    test("getSource miss → null", async () => {
        const r = new InMemorySourceRepository();
        expect(await r.getSource("urn:nope")).toBeNull();
    });

    test("updateSource replaces the endpoint set", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource(source());
        const updated = await r.updateSource(sourceTwoEndpoints());
        expect(updated?.endpoints).toHaveLength(2);
        expect((await r.getSource("urn:shop"))?.endpoints).toHaveLength(2);
    });

    test("updateSource on a missing urn → null (no insert)", async () => {
        const r = new InMemorySourceRepository();
        const res = await r.updateSource(source());
        expect(res).toBeNull();
        expect(await r.getSource("urn:shop")).toBeNull();
    });

    test("updateSource keys on the urn (key unchanged)", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource(source());
        await r.updateSource(sourceTwoEndpoints());
        expect((await r.getSource("urn:shop"))?.urn).toBe("urn:shop");
    });

    test("updateSource is a full replace — dropped fields disappear", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource({
            urn: "urn:shop",
            meta: { name: "Shop" },
            endpoints: [
                { urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" },
                { urn: "urn:shop:addItem", method: "POST", targetUrl: "https://api.shop.com/cart/items" },
            ],
        });
        await r.updateSource({
            urn: "urn:shop",
            endpoints: [{ urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" }],
        });
        const p = await r.getSource("urn:shop");
        expect(p?.endpoints).toHaveLength(1); // the second endpoint is gone
        expect(p?.meta).toBeUndefined(); // the previously-set meta was dropped
    });

    test("updateSource — mutating the input after update doesn't corrupt the store", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource(source());
        const input = sourceTwoEndpoints();
        await r.updateSource(input);
        input.endpoints.push({ urn: "urn:shop:injected", method: "GET", targetUrl: "https://x.com" });
        expect((await r.getSource("urn:shop"))?.endpoints).toHaveLength(2);
    });

    test("deleteSource removes the source", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource(source());
        expect(await r.deleteSource("urn:shop")).toBe(true);
        expect(await r.getSource("urn:shop")).toBeNull();
    });

    test("deleteSource on an absent urn → false", async () => {
        const r = new InMemorySourceRepository();
        expect(await r.deleteSource("urn:nope")).toBe(false);
    });

    test("getAllSources", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource(source());
        expect(await r.getAllSources()).toHaveLength(1);
    });

    test("getEndpoint hit / miss", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource(source());
        expect((await r.getEndpoint("urn:shop:getCart"))?.method).toBe("GET");
        expect(await r.getEndpoint("urn:shop:nope")).toBeNull();
    });

    test("defensive clone — mutating a read result doesn't corrupt the store", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource(source());
        const p1 = await r.getSource("urn:shop");
        p1!.endpoints.push({ urn: "urn:shop:injected", method: "GET", targetUrl: "https://x.com" });
        p1!.meta!.name = "HACKED";
        const p2 = await r.getSource("urn:shop");
        expect(p2?.endpoints).toHaveLength(1);
        expect(p2?.meta?.name).toBe("Shop");
    });

    test("defensive clone — mutating the input after create doesn't corrupt the store", async () => {
        const r = new InMemorySourceRepository();
        const input = source();
        await r.createSource(input);
        input.endpoints.push({ urn: "urn:shop:injected", method: "GET", targetUrl: "https://x.com" });
        expect((await r.getSource("urn:shop"))?.endpoints).toHaveLength(1);
    });
});
