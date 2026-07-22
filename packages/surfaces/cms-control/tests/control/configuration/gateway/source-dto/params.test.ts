import { describe, test, expect } from "bun:test";
import { parseSourceDto } from "cms-control/core/validation/gateway/parseSourceDto";
import { sourceDtoToSource } from "@bernouy/cms-sources";

/** A valid single-endpoint body, as an admin form posts it (flat keys). */
const validBody = (over: Record<string, unknown> = {}) => ({
    id: "shop",
    "meta.name": "Shop",
    "endpoints.0.endpointId": "getCart",
    "endpoints.0.method": "GET",
    "endpoints.0.targetUrl": "https://api.shop.com/cart",
    ...over,
});

describe("parseSourceDto", () => {
    test("malformed / non-array params blob → InvalidParam", () => {
        expect(() => parseSourceDto(validBody({ "endpoints.0.params": "{not json" }))).toThrow(/endpoints\.0\.params/);
        expect(() => parseSourceDto(validBody({ "endpoints.0.params": JSON.stringify({ name: "x" }) }))).toThrow(
            /endpoints\.0\.params/,
        );
    });

    test("path params derived from URL {placeholders} (required, in:path)", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.targetUrl": "https://api.shop.com/items/{id}" }));
        expect(dto.endpoints[0]!.params).toEqual([{ name: "id", in: "path", type: "string", required: true }]);
    });

    test("multiple path params kept in URL order", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.targetUrl": "https://api.shop.com/{org}/items/{id}" }));
        expect(dto.endpoints[0]!.params.map((p) => p.name)).toEqual(["org", "id"]);
        expect(dto.endpoints[0]!.params.every((p) => p.in === "path" && p.required)).toBe(true);
    });

    test("a repeated placeholder is deduped", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.targetUrl": "https://api.shop.com/{id}/sub/{id}" }));
        expect(dto.endpoints[0]!.params.map((p) => p.name)).toEqual(["id"]);
    });

    test("path params precede blob params in the merged list", () => {
        const dto = parseSourceDto(
            validBody({
                "endpoints.0.targetUrl": "https://api.shop.com/items/{id}",
                "endpoints.0.params": JSON.stringify([{ name: "limit", in: "query", type: "number" }]),
            }),
        );
        expect(dto.endpoints[0]!.params).toEqual([
            { name: "id", in: "path", type: "string", required: true },
            { name: "limit", in: "query", type: "number", required: false },
        ]);
    });

    test("a blob param shadowing a path placeholder → InvalidParam", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.targetUrl": "https://api.shop.com/items/{id}",
                    "endpoints.0.params": JSON.stringify([{ name: "id", in: "query", type: "string" }]),
                }),
            ),
        ).toThrow(/duplicate param name/);
    });

    test("bad param type → InvalidParam (scoped to the array index)", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.params": JSON.stringify([{ name: "x", in: "query", type: "object" }]),
                }),
            ),
        ).toThrow(/endpoints\.0\.params\.0\.type/);
    });

    test("`in:'path'` from the blob → InvalidParam (path is URL-derived, never posted)", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.params": JSON.stringify([{ name: "x", in: "path", type: "string" }]),
                }),
            ),
        ).toThrow(/endpoints\.0\.params\.0\.in/);
    });

    test("unknown param `in` → InvalidParam", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.params": JSON.stringify([{ name: "x", in: "body", type: "string" }]),
                }),
            ),
        ).toThrow(/endpoints\.0\.params\.0\.in/);
    });

    test("duplicate param name in the blob → InvalidParam", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.params": JSON.stringify([
                        { name: "x", in: "query", type: "string" },
                        { name: "x", in: "query", type: "number" },
                    ]),
                }),
            ),
        ).toThrow(/duplicate param name/);
    });

    test("gap compaction — a removed row (missing index) is skipped, result is dense", () => {
        const dto = parseSourceDto({
            id: "shop",
            "endpoints.0.endpointId": "a",
            "endpoints.0.method": "GET",
            "endpoints.0.targetUrl": "https://x.com",
            "endpoints.2.endpointId": "b",
            "endpoints.2.method": "GET",
            "endpoints.2.targetUrl": "https://y.com",
        });
        expect(dto.endpoints).toHaveLength(2);
        expect(dto.endpoints.map((e) => e.endpointId)).toEqual(["a", "b"]);
    });
});
