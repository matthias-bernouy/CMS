import { describe, expect, test } from "bun:test";
import { buildUrl, findProviderForValue, parseMethodsFilter } from "src/control/components/admin/SchemaPicker/controller";

describe("buildUrl", () => {
    test("joins server and path with a single separator", () => {
        expect(buildUrl("https://api.x.com/v1", "/users")).toBe("https://api.x.com/v1/users");
    });

    test("normalises a trailing slash on the server", () => {
        expect(buildUrl("https://api.x.com/v1/", "/users")).toBe("https://api.x.com/v1/users");
    });

    test("prepends a leading slash if the path lacks one", () => {
        expect(buildUrl("https://api.x.com", "users")).toBe("https://api.x.com/users");
    });

    test("preserves OpenAPI path templates", () => {
        expect(buildUrl("https://api.x.com", "/users/{id}/orders")).toBe("https://api.x.com/users/{id}/orders");
    });

    test("tolerates an empty server (degraded mode — no provider matched)", () => {
        expect(buildUrl("", "/users")).toBe("/users");
    });
});

describe("findProviderForValue", () => {
    const providers = [
        { id: "hub",    server: "https://api.hub.com/v1" },
        { id: "hub-v2", server: "https://api.hub.com/v2" },
        { id: "other",  server: "https://other.api"     },
        { id: "empty",  server: ""                       },
    ];

    test("matches the provider whose server is a prefix of the value", () => {
        expect(findProviderForValue(providers, "https://api.hub.com/v1/users")?.id).toBe("hub");
    });

    test("matches the bare server URL (no path)", () => {
        expect(findProviderForValue(providers, "https://api.hub.com/v1")?.id).toBe("hub");
    });

    test("does not collide on a longer same-host prefix", () => {
        expect(findProviderForValue(providers, "https://api.hub.com/v2/users")?.id).toBe("hub-v2");
        expect(findProviderForValue(providers, "https://api.hub.com/v10/x"  )).toBeNull();
    });

    test("ignores providers with empty server", () => {
        expect(findProviderForValue(providers, "")).toBeNull();
        expect(findProviderForValue(providers, "anything")).toBeNull();
    });

    test("longest matching prefix wins", () => {
        const overlap = [
            { id: "short", server: "https://api.hub.com"    },
            { id: "long",  server: "https://api.hub.com/v1" },
        ];
        expect(findProviderForValue(overlap, "https://api.hub.com/v1/users")?.id).toBe("long");
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
