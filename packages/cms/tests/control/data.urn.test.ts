import { describe, expect, test } from "bun:test";
import { buildUrl, findProviderForValue, parseMethodsFilter } from "src/control/components/admin/SchemaPicker/controller";

describe("buildUrl", () => {
    test("emits the proxy path for a provider id and operation path", () => {
        expect(buildUrl("hub", "/users")).toBe("/.cms/data/hub/users");
    });

    test("prepends a leading slash if the path lacks one", () => {
        expect(buildUrl("hub", "users")).toBe("/.cms/data/hub/users");
    });

    test("preserves OpenAPI path templates", () => {
        expect(buildUrl("hub", "/users/{id}/orders")).toBe("/.cms/data/hub/users/{id}/orders");
    });

    test("normalises an empty path to the provider root", () => {
        expect(buildUrl("hub", "")).toBe("/.cms/data/hub/");
    });
});

describe("findProviderForValue", () => {
    const providers = [
        { id: "hub",    server: "https://api.hub.com/v1" },
        { id: "hub-v2", server: "https://api.hub.com/v2" },
        { id: "other",  server: "https://other.api"     },
    ];

    test("matches the provider whose id appears in the proxy path", () => {
        expect(findProviderForValue(providers, "/.cms/data/hub/users")?.id).toBe("hub");
        expect(findProviderForValue(providers, "/.cms/data/hub-v2/users")?.id).toBe("hub-v2");
    });

    test("matches the bare provider root (no operation path)", () => {
        expect(findProviderForValue(providers, "/.cms/data/hub/")?.id).toBe("hub");
    });

    test("returns null for unknown providers", () => {
        expect(findProviderForValue(providers, "/.cms/data/missing/users")).toBeNull();
    });

    test("returns null for non-proxy URLs (legacy absolute, garbage, empty)", () => {
        expect(findProviderForValue(providers, "https://api.hub.com/v1/users")).toBeNull();
        expect(findProviderForValue(providers, "anything")).toBeNull();
        expect(findProviderForValue(providers, "")).toBeNull();
    });

    test("ignores leading double-slashes / trailing query gracefully", () => {
        expect(findProviderForValue(providers, "/.cms/data/hub/users?x=1")?.id).toBe("hub");
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
