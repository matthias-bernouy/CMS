import { describe, test, expect } from "bun:test";
import { validateProvider, endpointBelongsToProvider } from "cms-gateway/core/validateProvider";
import type { Provider, Endpoint } from "cms-gateway/interfaces/Gateway";

const ep = (urn: string, targetUrl = "https://api.shop.com/x"): Endpoint =>
    ({ urn, method: "GET", targetUrl });

const provider = (over: Partial<Provider> = {}): Provider => ({
    urn: "urn:shop",
    endpoints: [ep("urn:shop:getCart")],
    ...over,
});

describe("validateProvider", () => {
    test("valid provider → no errors", () => {
        expect(validateProvider(provider())).toEqual([]);
    });
    test("invalid provider urn", () => {
        const errs = validateProvider(provider({ urn: "shop" }));
        expect(errs.some(e => e.includes("invalid provider urn"))).toBe(true);
    });
    test("endpoint not belonging to provider", () => {
        const errs = validateProvider(provider({ endpoints: [ep("urn:other:x")] }));
        expect(errs.some(e => e.includes("does not belong"))).toBe(true);
    });
    test("invalid endpoint urn (provider-shaped)", () => {
        const errs = validateProvider(provider({ endpoints: [ep("urn:shop")] }));
        expect(errs.some(e => e.includes("invalid endpoint urn"))).toBe(true);
    });
    test("duplicate endpoint urn", () => {
        const errs = validateProvider(provider({ endpoints: [ep("urn:shop:a"), ep("urn:shop:a")] }));
        expect(errs.some(e => e.includes("duplicate"))).toBe(true);
    });
    test("unparseable targetUrl", () => {
        const errs = validateProvider(provider({ endpoints: [ep("urn:shop:x", "not a url")] }));
        expect(errs.some(e => e.includes("targetUrl"))).toBe(true);
    });
    test("unknown HTTP method", () => {
        const errs = validateProvider(provider({ endpoints: [{ ...ep("urn:shop:x"), method: "FETCH" as any }] }));
        expect(errs.some(e => e.includes("invalid method"))).toBe(true);
    });
    test("param with an unknown `in`", () => {
        const e = { ...ep("urn:shop:x"), input: { params: [{ name: "q", in: "cookie" as any, schema: { type: "string" as const } }] } };
        const errs = validateProvider(provider({ endpoints: [e] }));
        expect(errs.some(m => m.includes("invalid param location"))).toBe(true);
    });
    test("duplicate param name", () => {
        const p = { name: "q", in: "query" as const, schema: { type: "string" as const } };
        const e = { ...ep("urn:shop:x"), input: { params: [p, { ...p }] } };
        const errs = validateProvider(provider({ endpoints: [e] }));
        expect(errs.some(m => m.includes("duplicate param"))).toBe(true);
    });
    test("header-param with a forbidden name (host/cookie) is rejected", () => {
        const e = { ...ep("urn:shop:x"), input: { params: [{ name: "Host", in: "header" as const, schema: { type: "string" as const } }] } };
        const errs = validateProvider(provider({ endpoints: [e] }));
        expect(errs.some(m => m.includes("forbidden or invalid header param"))).toBe(true);
    });
    test("computed userID is valid for query and header params", () => {
        const e = { ...ep("urn:shop:x"), input: { params: [
            { name: "user_id", in: "query" as const, source: { from: "computed" as const, ref: "userID" as const }, schema: { type: "string" as const } },
            { name: "X-User-ID", in: "header" as const, source: { from: "computed" as const, ref: "userID" as const }, schema: { type: "string" as const } },
        ] } };
        expect(validateProvider(provider({ endpoints: [e] }))).toEqual([]);
    });
    test("computed params reject path and unknown refs", () => {
        const e = { ...ep("urn:shop:x"), input: { params: [
            { name: "id", in: "path" as const, source: { from: "computed" as const, ref: "userID" as const }, schema: { type: "string" as const } },
            { name: "email", in: "query" as const, source: { from: "computed" as const, ref: "email" as any }, schema: { type: "string" as const } },
        ] } };
        const errs = validateProvider(provider({ endpoints: [e] }));
        expect(errs.some(m => m.includes("computed param is not supported"))).toBe(true);
        expect(errs.some(m => m.includes("invalid computed ref"))).toBe(true);
    });
    test("config header: forbidden name, control-char value, secret without ref", () => {
        const e = { ...ep("urn:shop:x"), headers: [
            { name: "cookie",   source: { from: "static" as const, value: "x" } },
            { name: "X-Bad",    source: { from: "static" as const, value: "a\r\nb" } },
            { name: "X-Secret", source: { from: "secret" as const, ref: "" } },
        ] };
        const errs = validateProvider(provider({ endpoints: [e] }));
        expect(errs.some(m => m.includes("forbidden or invalid header name"))).toBe(true);
        expect(errs.some(m => m.includes("invalid header value"))).toBe(true);
        expect(errs.some(m => m.includes("secret header without ref"))).toBe(true);
    });
    test("duplicate header name (case-insensitive)", () => {
        const e = { ...ep("urn:shop:x"), headers: [
            { name: "X-Api-Key", source: { from: "static" as const, value: "a" } },
            { name: "x-api-key", source: { from: "static" as const, value: "b" } },
        ] };
        const errs = validateProvider(provider({ endpoints: [e] }));
        expect(errs.some(m => m.includes("duplicate header"))).toBe(true);
    });
    test("computed config header accepts userID and rejects unknown refs", () => {
        const good = { ...ep("urn:shop:x"), headers: [
            { name: "X-User-ID", source: { from: "computed" as const, ref: "userID" as const } },
        ] };
        expect(validateProvider(provider({ endpoints: [good] }))).toEqual([]);

        const bad = { ...ep("urn:shop:x"), headers: [
            { name: "X-User-Email", source: { from: "computed" as const, ref: "email" as any } },
        ] };
        const errs = validateProvider(provider({ endpoints: [bad] }));
        expect(errs.some(m => m.includes("invalid computed ref"))).toBe(true);
    });
    test("secret config header accepts safe prefix and rejects control chars", () => {
        const good = { ...ep("urn:shop:x"), headers: [
            { name: "Authorization", source: { from: "secret" as const, ref: "${KEY}", prefix: "Bearer " } },
        ] };
        expect(validateProvider(provider({ endpoints: [good] }))).toEqual([]);

        const bad = { ...ep("urn:shop:x"), headers: [
            { name: "Authorization", source: { from: "secret" as const, ref: "${KEY}", prefix: "Bearer \n" } },
        ] };
        const errs = validateProvider(provider({ endpoints: [bad] }));
        expect(errs.some(m => m.includes("invalid header prefix"))).toBe(true);
    });
    test("invalid + duplicate response status", () => {
        const e = { ...ep("urn:shop:x"), output: [{ status: "200" }, { status: "200" }, { status: "2xx" }] };
        const errs = validateProvider(provider({ endpoints: [e] }));
        expect(errs.some(m => m.includes("invalid response status"))).toBe(true);
        expect(errs.some(m => m.includes("duplicate response status"))).toBe(true);
    });
    test("a fully-furnished valid endpoint stays valid", () => {
        const e = {
            ...ep("urn:shop:x"),
            input: { params: [
                { name: "q", in: "query" as const, schema: { type: "string" as const } },
                { name: "X-Trace-Id", in: "header" as const, schema: { type: "string" as const } },
            ] },
            headers: [{ name: "Authorization", source: { from: "secret" as const, ref: "${KEY}" } }],
            output: [{ status: "200" }, { status: "default" }],
        };
        expect(validateProvider(provider({ endpoints: [e] }))).toEqual([]);
    });
});

describe("endpointBelongsToProvider", () => {
    test("match", () => expect(endpointBelongsToProvider("urn:shop:getCart", "urn:shop")).toBe(true));
    test("mismatch", () => expect(endpointBelongsToProvider("urn:other:getCart", "urn:shop")).toBe(false));
    test("a provider urn is not an endpoint → false", () =>
        expect(endpointBelongsToProvider("urn:shop", "urn:shop")).toBe(false));
});
