import { describe, test, expect } from "bun:test";

import { assertValidProviderId } from "src/core/validation/proxy/providerId";
import { assertValidProxyAuthValue } from "src/core/validation/proxy/authValue";
import { assertValidProxyHeaderName } from "src/core/validation/proxy/headerName";
import { assertValidProxyServer } from "src/core/validation/proxy/server";

describe("assertValidProviderId", () => {
    test("accepts simple slugs", () => {
        expect(() => assertValidProviderId("stripe")).not.toThrow();
        expect(() => assertValidProviderId("weather-api")).not.toThrow();
        expect(() => assertValidProviderId("a")).not.toThrow();
    });
    test("rejects non-string, empty, leading digit, uppercase, underscore, dollar", () => {
        expect(() => assertValidProviderId(42 as unknown as string)).toThrow();
        expect(() => assertValidProviderId("")).toThrow();
        expect(() => assertValidProviderId("1stripe")).toThrow();
        expect(() => assertValidProviderId("Stripe")).toThrow();
        expect(() => assertValidProviderId("my_api")).toThrow();
        expect(() => assertValidProviderId("api$1")).toThrow();
        expect(() => assertValidProviderId("a".repeat(64))).toThrow();
    });
});

describe("assertValidProxyAuthValue", () => {
    test("accepts ordinary tokens", () => {
        expect(() => assertValidProxyAuthValue("sk_live_abc123XYZ", "f")).not.toThrow();
        expect(() => assertValidProxyAuthValue("Basic dXNlcjpwYXNz", "f")).not.toThrow();
    });
    test("rejects $ (envsubst hazard)", () => {
        expect(() => assertValidProxyAuthValue("sk_$secret", "f")).toThrow(/forbidden/);
        expect(() => assertValidProxyAuthValue("${HOME}", "f")).toThrow(/forbidden/);
    });
    test("rejects NUL / CR / LF", () => {
        expect(() => assertValidProxyAuthValue("a\0b", "f")).toThrow();
        expect(() => assertValidProxyAuthValue("a\nb", "f")).toThrow();
        expect(() => assertValidProxyAuthValue("a\rb", "f")).toThrow();
    });
    test("rejects empty + non-string", () => {
        expect(() => assertValidProxyAuthValue("", "f")).toThrow();
        expect(() => assertValidProxyAuthValue(42 as unknown as string, "f")).toThrow();
    });
});

describe("assertValidProxyHeaderName", () => {
    test("accepts canonical header names", () => {
        expect(() => assertValidProxyHeaderName("X-API-Key", "h")).not.toThrow();
        expect(() => assertValidProxyHeaderName("Authorization", "h")).not.toThrow();
    });
    test("rejects spaces, punctuation, leading digits", () => {
        expect(() => assertValidProxyHeaderName("X API", "h")).toThrow();
        expect(() => assertValidProxyHeaderName("X:Key", "h")).toThrow();
        expect(() => assertValidProxyHeaderName("1Key", "h")).toThrow();
        expect(() => assertValidProxyHeaderName("", "h")).toThrow();
    });
});

describe("assertValidProxyServer", () => {
    test("accepts plain http / https URLs with optional path", () => {
        expect(() => assertValidProxyServer("https://api.stripe.com/v1")).not.toThrow();
        expect(() => assertValidProxyServer("http://localhost:8080")).not.toThrow();
        expect(() => assertValidProxyServer("https://example.com/")).not.toThrow();
    });
    test("rejects invalid URLs and non-http schemes", () => {
        expect(() => assertValidProxyServer("not a url")).toThrow();
        expect(() => assertValidProxyServer("ftp://example.com")).toThrow();
        expect(() => assertValidProxyServer("ws://example.com")).toThrow();
    });
    test("rejects userinfo, query, fragment", () => {
        expect(() => assertValidProxyServer("https://user:pass@api.example.com")).toThrow(/credentials/);
        expect(() => assertValidProxyServer("https://api.example.com?key=x")).toThrow(/query/);
        expect(() => assertValidProxyServer("https://api.example.com#frag")).toThrow(/fragment/);
    });
});
