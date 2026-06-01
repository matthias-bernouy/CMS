import { describe, test, expect } from "bun:test";
import { validateProvider, endpointBelongsToProvider } from "cms-gateway/core/validateProvider";
import type { Provider, Endpoint } from "cms-gateway/interfaces/Gateway";

const ep = (urn: string, targetUrl = "https://api.shop.com/x"): Endpoint =>
    ({ urn, method: "GET", targetUrl });

const provider = (over: Partial<Provider> = {}): Provider => ({
    urn: "urn:shop",
    endpoints: [ep("urn:shop:getCart")],
    ...over,
});

describe("validateProvider", () => {
    test("valid provider → no errors", () => {
        expect(validateProvider(provider())).toEqual([]);
    });
    test("invalid provider urn", () => {
        const errs = validateProvider(provider({ urn: "shop" }));
        expect(errs.some(e => e.includes("urn de provider invalide"))).toBe(true);
    });
    test("endpoint not belonging to provider", () => {
        const errs = validateProvider(provider({ endpoints: [ep("urn:other:x")] }));
        expect(errs.some(e => e.includes("n'appartient pas"))).toBe(true);
    });
    test("invalid endpoint urn (provider-shaped)", () => {
        const errs = validateProvider(provider({ endpoints: [ep("urn:shop")] }));
        expect(errs.some(e => e.includes("urn d'endpoint invalide"))).toBe(true);
    });
    test("duplicate endpoint urn", () => {
        const errs = validateProvider(provider({ endpoints: [ep("urn:shop:a"), ep("urn:shop:a")] }));
        expect(errs.some(e => e.includes("dupliqué"))).toBe(true);
    });
    test("unparseable targetUrl", () => {
        const errs = validateProvider(provider({ endpoints: [ep("urn:shop:x", "not a url")] }));
        expect(errs.some(e => e.includes("targetUrl"))).toBe(true);
    });
});

describe("endpointBelongsToProvider", () => {
    test("match", () => expect(endpointBelongsToProvider("urn:shop:getCart", "urn:shop")).toBe(true));
    test("mismatch", () => expect(endpointBelongsToProvider("urn:other:getCart", "urn:shop")).toBe(false));
    test("a provider urn is not an endpoint → false", () =>
        expect(endpointBelongsToProvider("urn:shop", "urn:shop")).toBe(false));
});
