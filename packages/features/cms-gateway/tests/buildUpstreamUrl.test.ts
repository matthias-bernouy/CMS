import { describe, test, expect } from "bun:test";
import { buildUpstreamUrl } from "cms-gateway/core/buildUpstreamUrl";
import type { Endpoint } from "cms-gateway/interfaces/Gateway";

const ep = (over: Partial<Endpoint> = {}): Endpoint =>
    ({ urn: "urn:x:e", method: "GET", targetUrl: "https://api.example.com/v1/items", ...over });

const q = (s: string) => new URL("http://local/?" + s).searchParams;

describe("buildUpstreamUrl", () => {
    test("no params → targetUrl as-is", () => {
        const r = buildUpstreamUrl(ep(), q(""));
        expect(r).toEqual({ ok: true, url: "https://api.example.com/v1/items", headers: {} });
    });

    test("only DECLARED query params are forwarded", () => {
        const e = ep({ input: { params: [{ name: "lat", in: "query", required: true, schema: { type: "number" } }] } });
        const r = buildUpstreamUrl(e, q("lat=48.8&evil=x"));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.url).toBe("https://api.example.com/v1/items?lat=48.8");   // evil dropped
    });

    test("path param substituted + encoded (no traversal)", () => {
        const e = ep({ targetUrl: "https://api.example.com/v1/users/{id}", input: { params: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
        ] } });
        const r = buildUpstreamUrl(e, q("id=" + encodeURIComponent("../../admin")));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.url).toBe("https://api.example.com/v1/users/..%2F..%2Fadmin");
    });

    test("missing required param → 400", () => {
        const e = ep({ input: { params: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] } });
        const r = buildUpstreamUrl(e, q(""));
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.status).toBe(400); expect(r.message).toContain("id"); }
    });

    test("optional param absent → skipped", () => {
        const e = ep({ input: { params: [{ name: "lang", in: "query", schema: { type: "string" } }] } });
        const r = buildUpstreamUrl(e, q(""));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.url).toBe("https://api.example.com/v1/items");
    });

    test("header param returned in headers (not in url)", () => {
        const e = ep({ input: { params: [{ name: "X-Trace", in: "header", schema: { type: "string" } }] } });
        const r = buildUpstreamUrl(e, q("X-Trace=abc"));
        expect(r.ok).toBe(true);
        if (r.ok) { expect(r.headers).toEqual({ "X-Trace": "abc" }); expect(r.url).toBe("https://api.example.com/v1/items"); }
    });

    test("unfilled placeholder in targetUrl → 500", () => {
        const e = ep({ targetUrl: "https://api.example.com/v1/users/{id}" });  // no path param declared
        const r = buildUpstreamUrl(e, q(""));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(500);
    });

    test("multiple path placeholders are each substituted + encoded independently", () => {
        const e = ep({ targetUrl: "https://api.example.com/u/{userId}/p/{postId}", input: { params: [
            { name: "userId", in: "path", required: true, schema: { type: "string" } },
            { name: "postId", in: "path", required: true, schema: { type: "string" } },
        ] } });
        const r = buildUpstreamUrl(e, q("userId=a%2Fb&postId=42"));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.url).toBe("https://api.example.com/u/a%2Fb/p/42");
    });

    test("a placeholder in the HOST cannot escape the declared origin → rejected", () => {
        const e = ep({ targetUrl: "https://{host}/data", input: { params: [
            { name: "host", in: "path", required: true, schema: { type: "string" } },
        ] } });
        const r = buildUpstreamUrl(e, q("host=evil.com"));
        expect(r.ok).toBe(false);                       // origin check blocks it
        if (!r.ok) expect([500, 502]).toContain(r.status);
    });
});
