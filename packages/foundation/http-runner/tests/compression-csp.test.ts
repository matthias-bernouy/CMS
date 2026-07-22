import { describe, expect, test } from "bun:test";
import { cachedResponse, compress } from "@bernouy/http-runner";
import { MemCache, reqWithAccept } from "./support/compression";

const html = () => compress("<!doctype html><html></html>", "text/html");

describe("CSP header — opt-out", () => {
    test("HTML response carries the CSP header by default", () => {
        const response = cachedResponse(reqWithAccept(null), "k", new MemCache(), html);
        expect(response.headers.get("Content-Security-Policy")).not.toBeNull();
    });

    test("skipCspHeader: true drops the CSP header on HTML responses", () => {
        const response = cachedResponse(reqWithAccept(null), "k", new MemCache(), html, undefined, {
            skipCspHeader: true,
        });
        expect(response.headers.get("Content-Security-Policy")).toBeNull();
    });

    test("non-HTML responses never carry a CSP header", () => {
        const text = () => compress("hello", "text/plain");
        const response = cachedResponse(reqWithAccept(null), "k", new MemCache(), text);
        expect(response.headers.get("Content-Security-Policy")).toBeNull();
    });
});

describe("CSP header — extras", () => {
    test("with no extras, header matches the static baseline", () => {
        const response = cachedResponse(reqWithAccept(null), "k", new MemCache(), html);
        const csp = response.headers.get("Content-Security-Policy") ?? "";
        expect(csp).toContain("default-src 'self'");
        expect(csp).not.toContain("connect-src");
        expect(csp).not.toContain("media-src");
    });

    test("with extras, header includes connect-src and media-src directives", () => {
        const response = cachedResponse(reqWithAccept(null), "k", new MemCache(), html, undefined, {
            cspExtras: { connectExtras: ["https://cdn.example.com"], mediaExtras: ["https://cdn.example.com"] },
        });
        const csp = response.headers.get("Content-Security-Policy") ?? "";
        expect(csp).toContain("connect-src 'self' https://cdn.example.com");
        expect(csp).toContain("media-src 'self' https://cdn.example.com");
    });

    test("extras are ignored when skipCspHeader is true", () => {
        const response = cachedResponse(reqWithAccept(null), "k", new MemCache(), html, undefined, {
            skipCspHeader: true,
            cspExtras: { connectExtras: ["https://cdn.example.com"], mediaExtras: [] },
        });
        expect(response.headers.get("Content-Security-Policy")).toBeNull();
    });

    test("extras are ignored on non-HTML responses", () => {
        const text = () => compress("hello", "text/plain");
        const response = cachedResponse(reqWithAccept(null), "k", new MemCache(), text, undefined, {
            cspExtras: { connectExtras: ["https://cdn.example.com"], mediaExtras: [] },
        });
        expect(response.headers.get("Content-Security-Policy")).toBeNull();
    });
});
