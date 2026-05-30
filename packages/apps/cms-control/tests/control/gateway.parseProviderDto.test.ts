import { describe, test, expect } from "bun:test";
import { parseProviderDto } from "cms-control/core/validation/gateway/parseProviderDto";

/** A valid single-endpoint body, as `<cms-form>` would post it (flat keys). */
const validBody = (over: Record<string, unknown> = {}) => ({
    id: "shop",
    "meta.name": "Shop",
    "endpoints.0.endpointId": "getCart",
    "endpoints.0.method": "GET",
    "endpoints.0.targetUrl": "https://api.shop.com/cart",
    ...over,
});

describe("parseProviderDto", () => {
    test("multi-row body → endpoints in order", () => {
        const dto = parseProviderDto({
            id: "shop",
            "endpoints.0.endpointId": "getCart", "endpoints.0.method": "GET",  "endpoints.0.targetUrl": "https://api.shop.com/cart",
            "endpoints.1.endpointId": "addItem", "endpoints.1.method": "POST", "endpoints.1.targetUrl": "https://api.shop.com/items",
        });
        expect(dto.endpoints).toHaveLength(2);
        expect(dto.endpoints.map(e => e.endpointId)).toEqual(["getCart", "addItem"]);
        expect(dto.endpoints[1]!.method).toBe("POST");
    });

    test("single-row body → 1 endpoint", () => {
        expect(parseProviderDto(validBody()).endpoints).toHaveLength(1);
    });

    test("gap compaction — a removed row (missing index) is skipped, result is dense", () => {
        const dto = parseProviderDto({
            id: "shop",
            "endpoints.0.endpointId": "a", "endpoints.0.method": "GET", "endpoints.0.targetUrl": "https://x.com",
            "endpoints.2.endpointId": "b", "endpoints.2.method": "GET", "endpoints.2.targetUrl": "https://y.com",
        });
        expect(dto.endpoints).toHaveLength(2);
        expect(dto.endpoints.map(e => e.endpointId)).toEqual(["a", "b"]);
    });

    test("missing id → MissingParam", () => {
        expect(() => parseProviderDto(validBody({ id: undefined }))).toThrow(/Missing param id/);
    });

    test("punctuation-only id (slugifies to empty) → InvalidParam", () => {
        expect(() => parseProviderDto(validBody({ id: "!!!" }))).toThrow(/Invalid param id/);
    });

    test("missing endpoint sub-field (key absent) → MissingParam scoped to the row", () => {
        expect(() => parseProviderDto({
            id: "shop",
            "endpoints.0.endpointId": "getCart",
            "endpoints.0.method": "GET",
            // targetUrl omitted entirely, as a form would when the input is absent
        })).toThrow(/Missing param endpoints\.0\.targetUrl/);
    });

    test("empty-string endpoint sub-field → MissingParam (empty input counts as missing)", () => {
        expect(() => parseProviderDto(validBody({ "endpoints.0.targetUrl": "" })))
            .toThrow(/Missing param endpoints\.0\.targetUrl/);
    });

    test("bad method → InvalidParam scoped to the row", () => {
        expect(() => parseProviderDto(validBody({ "endpoints.0.method": "FETCH" })))
            .toThrow(/Invalid param endpoints\.0\.method/);
    });

    test("bad targetUrl → InvalidParam scoped to the row", () => {
        expect(() => parseProviderDto(validBody({ "endpoints.0.targetUrl": "not a url" })))
            .toThrow(/Invalid param endpoints\.0\.targetUrl/);
    });

    test("duplicate endpointId across rows → InvalidParam", () => {
        expect(() => parseProviderDto({
            id: "shop",
            "endpoints.0.endpointId": "dup", "endpoints.0.method": "GET", "endpoints.0.targetUrl": "https://x.com",
            "endpoints.1.endpointId": "dup", "endpoints.1.method": "GET", "endpoints.1.targetUrl": "https://y.com",
        })).toThrow(/duplicate within provider/);
    });

    test("zero endpoints → allowed (provider shell; endpoints added on the edit page)", () => {
        const dto = parseProviderDto({ id: "shop", "meta.name": "Shop" });
        expect(dto.endpoints).toEqual([]);
        expect(dto.id).toBe("shop");
    });

    test("meta.name defaults to the id when absent", () => {
        const dto = parseProviderDto({
            id: "shop",
            "endpoints.0.endpointId": "getCart", "endpoints.0.method": "GET", "endpoints.0.targetUrl": "https://x.com",
        });
        expect(dto.meta.name).toBe("shop");
    });

    test("client-supplied endpoint urn is ignored (recomputed by the service)", () => {
        const dto = parseProviderDto(validBody({ "endpoints.0.urn": "urn:evil:inject" })) as any;
        expect(dto.endpoints[0].urn).toBeUndefined();
        expect(dto.endpoints[0].endpointId).toBe("getCart");
    });
});
