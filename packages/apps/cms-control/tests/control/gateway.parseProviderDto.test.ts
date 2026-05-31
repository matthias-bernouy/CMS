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
        expect(parseProviderDto(validBody()).endpoints[0]!.params).toEqual([]);   // no params declared
    });

    test("query params → endpoint.params", () => {
        const dto = parseProviderDto(validBody({
            "endpoints.0.params.0.name": "limit", "endpoints.0.params.0.in": "query",
            "endpoints.0.params.0.type": "number", "endpoints.0.params.0.required": "true",
            "endpoints.0.params.1.name": "q", "endpoints.0.params.1.in": "query", "endpoints.0.params.1.type": "string",
        }));
        expect(dto.endpoints[0]!.params).toEqual([
            { name: "limit", in: "query", type: "number", required: true },
            { name: "q",     in: "query", type: "string", required: false },
        ]);
    });

    test("param row with empty name is skipped (unfilled)", () => {
        const dto = parseProviderDto(validBody({
            "endpoints.0.params.0.name": "", "endpoints.0.params.0.in": "query", "endpoints.0.params.0.type": "string",
            "endpoints.0.params.1.name": "q", "endpoints.0.params.1.in": "query", "endpoints.0.params.1.type": "string",
        }));
        expect(dto.endpoints[0]!.params.map(p => p.name)).toEqual(["q"]);
    });

    test("path params derived from URL {placeholders} (required, in:path)", () => {
        const dto = parseProviderDto(validBody({ "endpoints.0.targetUrl": "https://api.shop.com/items/{id}" }));
        expect(dto.endpoints[0]!.params).toEqual([
            { name: "id", in: "path", type: "string", required: true },
        ]);
    });

    test("multiple path params kept in URL order", () => {
        const dto = parseProviderDto(validBody({ "endpoints.0.targetUrl": "https://api.shop.com/{org}/items/{id}" }));
        expect(dto.endpoints[0]!.params.map(p => p.name)).toEqual(["org", "id"]);
        expect(dto.endpoints[0]!.params.every(p => p.in === "path" && p.required)).toBe(true);
    });

    test("a repeated placeholder is deduped", () => {
        const dto = parseProviderDto(validBody({ "endpoints.0.targetUrl": "https://api.shop.com/{id}/sub/{id}" }));
        expect(dto.endpoints[0]!.params.map(p => p.name)).toEqual(["id"]);
    });

    test("path params precede query params in the merged list", () => {
        const dto = parseProviderDto(validBody({
            "endpoints.0.targetUrl": "https://api.shop.com/items/{id}",
            "endpoints.0.params.0.name": "limit", "endpoints.0.params.0.in": "query", "endpoints.0.params.0.type": "number",
        }));
        expect(dto.endpoints[0]!.params).toEqual([
            { name: "id",    in: "path",  type: "string", required: true },
            { name: "limit", in: "query", type: "number", required: false },
        ]);
    });

    test("a query param shadowing a path placeholder → InvalidParam", () => {
        expect(() => parseProviderDto(validBody({
            "endpoints.0.targetUrl": "https://api.shop.com/items/{id}",
            "endpoints.0.params.0.name": "id", "endpoints.0.params.0.in": "query", "endpoints.0.params.0.type": "string",
        }))).toThrow(/duplicate param name/);
    });

    test("param gap is compacted", () => {
        const dto = parseProviderDto(validBody({
            "endpoints.0.params.0.name": "a", "endpoints.0.params.0.in": "query", "endpoints.0.params.0.type": "string",
            "endpoints.0.params.2.name": "b", "endpoints.0.params.2.in": "query", "endpoints.0.params.2.type": "string",
        }));
        expect(dto.endpoints[0]!.params.map(p => p.name)).toEqual(["a", "b"]);
    });

    test("bad param type → InvalidParam", () => {
        expect(() => parseProviderDto(validBody({
            "endpoints.0.params.0.name": "x", "endpoints.0.params.0.in": "query", "endpoints.0.params.0.type": "object",
        }))).toThrow(/endpoints\.0\.params\.0\.type/);
    });

    test("bad param in → InvalidParam", () => {
        expect(() => parseProviderDto(validBody({
            "endpoints.0.params.0.name": "x", "endpoints.0.params.0.in": "body", "endpoints.0.params.0.type": "string",
        }))).toThrow(/endpoints\.0\.params\.0\.in/);
    });

    test("duplicate param name within an endpoint → InvalidParam", () => {
        expect(() => parseProviderDto(validBody({
            "endpoints.0.params.0.name": "x", "endpoints.0.params.0.in": "query", "endpoints.0.params.0.type": "string",
            "endpoints.0.params.1.name": "x", "endpoints.0.params.1.in": "query", "endpoints.0.params.1.type": "number",
        }))).toThrow(/duplicate param name/);
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
