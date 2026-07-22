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
    test("missing id → MissingParam", () => {
        expect(() => parseSourceDto(validBody({ id: undefined }))).toThrow(/Missing param id/);
    });

    test("punctuation-only id (slugifies to empty) → InvalidParam", () => {
        expect(() => parseSourceDto(validBody({ id: "!!!" }))).toThrow(/Invalid param id/);
    });

    test("missing endpoint sub-field (key absent) → MissingParam scoped to the row", () => {
        expect(() =>
            parseSourceDto({
                id: "shop",
                "endpoints.0.endpointId": "getCart",
                "endpoints.0.method": "GET",
                // targetUrl omitted entirely, as a form would when the input is absent
            }),
        ).toThrow(/Missing param endpoints\.0\.targetUrl/);
    });

    test("empty-string endpoint sub-field → MissingParam (empty input counts as missing)", () => {
        expect(() => parseSourceDto(validBody({ "endpoints.0.targetUrl": "" }))).toThrow(
            /Missing param endpoints\.0\.targetUrl/,
        );
    });

    test("bad method → InvalidParam scoped to the row", () => {
        expect(() => parseSourceDto(validBody({ "endpoints.0.method": "FETCH" }))).toThrow(
            /Invalid param endpoints\.0\.method/,
        );
    });

    test("bad targetUrl → InvalidParam scoped to the row", () => {
        expect(() => parseSourceDto(validBody({ "endpoints.0.targetUrl": "not a url" }))).toThrow(
            /Invalid param endpoints\.0\.targetUrl/,
        );
    });

    test("round-trips endpoint access mode", () => {
        const access = { mode: "admin" as const };
        const dto = parseSourceDto(validBody({ "endpoints.0.access": JSON.stringify(access) }));
        expect(dto.endpoints[0]!.access).toEqual(access);
        expect(sourceDtoToSource(dto).endpoints[0]!.access).toEqual(access);
    });

    test("rejects role-specific endpoint access", () => {
        expect(() =>
            parseSourceDto(
                validBody({
                    "endpoints.0.access": JSON.stringify({ mode: "admin", roles: ["custom"] }),
                }),
            ),
        ).toThrow(/no longer supported/);
    });

    test("duplicate endpointId across rows → InvalidParam", () => {
        expect(() =>
            parseSourceDto({
                id: "shop",
                "endpoints.0.endpointId": "dup",
                "endpoints.0.method": "GET",
                "endpoints.0.targetUrl": "https://x.com",
                "endpoints.1.endpointId": "dup",
                "endpoints.1.method": "GET",
                "endpoints.1.targetUrl": "https://y.com",
            }),
        ).toThrow(/duplicate within provider/);
    });

    test("zero endpoints → allowed (provider shell; endpoints added on the edit page)", () => {
        const dto = parseSourceDto({ id: "shop", "meta.name": "Shop" });
        expect(dto.endpoints).toEqual([]);
        expect(dto.id).toBe("shop");
    });

    test("provider meta.icon round-trips when the form posts it (B1)", () => {
        const dto = parseSourceDto(validBody({ "meta.icon": "map-pin" }));
        expect(dto.meta).toEqual({ name: "Shop", icon: "map-pin" } as any);
    });

    test("provider meta.svg round-trips when the form posts it", () => {
        const dto = parseSourceDto(validBody({ "meta.svg": '<svg viewBox="0 0 24 24"></svg>' }));
        expect(dto.meta).toEqual({ name: "Shop", svg: '<svg viewBox="0 0 24 24"></svg>' } as any);
    });

    test("blank meta.icon → no icon (provider had none)", () => {
        const dto = parseSourceDto(validBody({ "meta.icon": "" }));
        expect(dto.meta.icon).toBeUndefined();
    });

    test("meta.name defaults to the id when absent", () => {
        const dto = parseSourceDto({
            id: "shop",
            "endpoints.0.endpointId": "getCart",
            "endpoints.0.method": "GET",
            "endpoints.0.targetUrl": "https://x.com",
        });
        expect(dto.meta.name).toBe("shop");
    });

    test("client-supplied endpoint urn is ignored (recomputed by the service)", () => {
        const dto = parseSourceDto(validBody({ "endpoints.0.urn": "urn:evil:inject" })) as any;
        expect(dto.endpoints[0].urn).toBeUndefined();
        expect(dto.endpoints[0].endpointId).toBe("getCart");
    });
});
