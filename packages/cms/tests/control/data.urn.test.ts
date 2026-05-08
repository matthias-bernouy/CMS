import { describe, expect, test } from "bun:test";
import { buildUrn, parseMethodsFilter, parseUrn } from "src/control/components/admin/SchemaPicker/controller";

describe("parseUrn", () => {
    test("returns null for missing or non-cms strings", () => {
        // @ts-expect-error — intentional misuse
        expect(parseUrn(undefined)).toBe(null);
        expect(parseUrn("")).toBe(null);
        expect(parseUrn("hub-api")).toBe(null);
        expect(parseUrn("cms:other:hub-api")).toBe(null);
    });

    test("parses the V2 form with method + path", () => {
        expect(parseUrn("cms:schema:hub-api:GET:/api/users/{id}")).toEqual({
            providerId: "hub-api",
            method:     "GET",
            path:       "/api/users/{id}",
        });
    });

    test("supports paths containing colons (rare but legal)", () => {
        expect(parseUrn("cms:schema:hub:POST:/api/foo:bar")).toEqual({
            providerId: "hub",
            method:     "POST",
            path:       "/api/foo:bar",
        });
    });

    test("parses the V1 form (provider only)", () => {
        expect(parseUrn("cms:schema:hub-api")).toEqual({
            providerId: "hub-api",
            method:     "",
            path:       "",
        });
    });

    test("returns null when V2 prefix has no path part", () => {
        expect(parseUrn("cms:schema:hub:GET")).toBe(null);
    });
});

describe("buildUrn", () => {
    test("emits V2 form with method + path", () => {
        expect(buildUrn("hub-api", "GET", "/api/users/{id}")).toBe("cms:schema:hub-api:GET:/api/users/{id}");
    });

    test("falls back to V1 when method or path is empty", () => {
        expect(buildUrn("hub-api", "", "")).toBe("cms:schema:hub-api");
        expect(buildUrn("hub-api", "GET", "")).toBe("cms:schema:hub-api");
        expect(buildUrn("hub-api", "", "/users")).toBe("cms:schema:hub-api");
    });

    test("round-trips with parseUrn", () => {
        const urn = buildUrn("hub", "DELETE", "/items/{id}");
        expect(parseUrn(urn)).toEqual({ providerId: "hub", method: "DELETE", path: "/items/{id}" });
    });
});

describe("parseMethodsFilter", () => {
    test("returns null for missing/empty values", () => {
        expect(parseMethodsFilter(null)).toBe(null);
        expect(parseMethodsFilter("")).toBe(null);
        expect(parseMethodsFilter("   ")).toBe(null);
    });

    test("parses comma-separated values, uppercasing and trimming", () => {
        expect(parseMethodsFilter("GET")).toEqual(new Set(["GET"]));
        expect(parseMethodsFilter("get,post")).toEqual(new Set(["GET", "POST"]));
        expect(parseMethodsFilter(" GET , POST , ")).toEqual(new Set(["GET", "POST"]));
    });

    test("dedups duplicates", () => {
        expect(parseMethodsFilter("GET,GET,POST")).toEqual(new Set(["GET", "POST"]));
    });
});
