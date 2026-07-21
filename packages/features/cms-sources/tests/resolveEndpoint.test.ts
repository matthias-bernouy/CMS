import { describe, test, expect } from "bun:test";
import { resolveEndpoint } from "cms-sources/core/resolveEndpoint";
import { InMemorySourceRepository } from "cms-sources/default-implementation/InMemorySourceRepository";
import type { Source } from "cms-sources/interfaces/Source";

const source: Source = {
    urn: "urn:shop",
    endpoints: [{ urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" }],
};

async function seededRepo() {
    const r = new InMemorySourceRepository();
    await r.createSource(source);
    return r;
}

describe("resolveEndpoint", () => {
    test("resolves a declared endpoint", async () => {
        const res = await resolveEndpoint(await seededRepo(), ["shop", "getCart"], "GET");
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.endpoint.urn).toBe("urn:shop:getCart");
        }
    });
    test("method comparison is case-insensitive", async () => {
        const res = await resolveEndpoint(await seededRepo(), ["shop", "getCart"], "get");
        expect(res.ok).toBe(true);
    });
    test("tolerates a non-uppercase stored method (untyped JSON)", async () => {
        const r = new InMemorySourceRepository();
        await r.createSource({
            urn: "urn:s",
            endpoints: [{ urn: "urn:s:e", method: "post" as never, targetUrl: "https://x.com" }],
        });
        expect((await resolveEndpoint(r, ["s", "e"], "POST")).ok).toBe(true);
    });
    test("unknown endpoint → not_found", async () => {
        expect(await resolveEndpoint(await seededRepo(), ["shop", "nope"], "GET")).toEqual({
            ok: false,
            reason: "not_found",
        });
    });
    test("wrong segment count → not_found", async () => {
        const repo = await seededRepo();
        expect(await resolveEndpoint(repo, ["shop"], "GET")).toEqual({ ok: false, reason: "not_found" });
        expect(await resolveEndpoint(repo, ["shop", "getCart", "x"], "GET")).toEqual({
            ok: false,
            reason: "not_found",
        });
    });
    test("wrong method → method_not_allowed", async () => {
        expect(await resolveEndpoint(await seededRepo(), ["shop", "getCart"], "POST")).toEqual({
            ok: false,
            reason: "method_not_allowed",
        });
    });
});
