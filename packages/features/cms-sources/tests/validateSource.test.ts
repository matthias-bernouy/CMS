import { describe, test, expect } from "bun:test";
import { validateSourceTargetUrl, validateSource, endpointBelongsToSource } from "cms-sources/core/validateSource";
import type { Source, SourceEndpoint } from "cms-sources/interfaces/Source";

const ep = (urn: string, targetUrl = "https://api.shop.com/x"): SourceEndpoint =>
    ({ urn, method: "GET", targetUrl });

const source = (over: Partial<Source> = {}): Source => ({
    urn: "urn:shop",
    endpoints: [ep("urn:shop:getCart")],
    ...over,
});

describe("validateSource", () => {
    test("valid source → no errors", () => {
        expect(validateSource(source())).toEqual([]);
    });
    test("invalid source urn", () => {
        const errs = validateSource(source({ urn: "shop" }));
        expect(errs.some(e => e.includes("invalid source urn"))).toBe(true);
    });
    test("reserved system source urn", () => {
        const errs = validateSource(source({ urn: "urn:system-custom", endpoints: [ep("urn:system-custom:x")] }));
        expect(errs.some(e => e.includes("reserved system source urn"))).toBe(true);
    });
    test("endpoint not belonging to source", () => {
        const errs = validateSource(source({ endpoints: [ep("urn:other:x")] }));
        expect(errs.some(e => e.includes("does not belong"))).toBe(true);
    });
    test("invalid endpoint urn (source-shaped)", () => {
        const errs = validateSource(source({ endpoints: [ep("urn:shop")] }));
        expect(errs.some(e => e.includes("invalid endpoint urn"))).toBe(true);
    });
    test("duplicate endpoint urn", () => {
        const errs = validateSource(source({ endpoints: [ep("urn:shop:a"), ep("urn:shop:a")] }));
        expect(errs.some(e => e.includes("duplicate"))).toBe(true);
    });
    test("unparseable targetUrl", () => {
        const errs = validateSource(source({ endpoints: [ep("urn:shop:x", "not a url")] }));
        expect(errs.some(e => e.includes("targetUrl"))).toBe(true);
    });
    test("targetUrl must be http or https", () => {
        const errs = validateSource(source({ endpoints: [ep("urn:shop:x", "ftp://api.shop.com/x")] }));
        expect(errs.some(e => e.includes("http or https"))).toBe(true);
    });
    test("targetUrl rejects local/private IP ranges and metadata hosts", () => {
        const blocked = [
            "http://localhost/x",
            "http://api.localhost/x",
            "http://127.0.0.1/x",
            "http://10.1.2.3/x",
            "http://172.16.0.10/x",
            "http://192.168.1.9/x",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/x",
            "http://[fe80::1]/x",
            "http://[fc00::1]/x",
            "http://[::ffff:127.0.0.1]/x",
        ];

        for (const targetUrl of blocked) {
            const errs = validateSource(source({ endpoints: [ep("urn:shop:x", targetUrl)] }));
            expect(errs.some(e => e.includes("targetUrl"))).toBe(true);
        }
    });
    test("targetUrl allows public http/https and explicit blocked-host allowlist", () => {
        expect(validateSource(source({ endpoints: [ep("urn:shop:x", "http://api.shop.com/x")] }))).toEqual([]);
        expect(validateSourceTargetUrl("http://127.0.0.1/x").ok).toBe(false);
        expect(validateSourceTargetUrl("http://127.0.0.1/x", { allowBlockedTargetHosts: ["127.0.0.1"] }).ok).toBe(true);
    });
    test("unknown HTTP method", () => {
        const errs = validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), method: "FETCH" as any }] }));
        expect(errs.some(e => e.includes("invalid method"))).toBe(true);
    });
    test("param with an unknown `in`", () => {
        const e = { ...ep("urn:shop:x"), input: { params: [{ name: "q", in: "cookie" as any, schema: { type: "string" as const } }] } };
        const errs = validateSource(source({ endpoints: [e] }));
        expect(errs.some(m => m.includes("invalid param location"))).toBe(true);
    });
    test("duplicate param name", () => {
        const p = { name: "q", in: "query" as const, schema: { type: "string" as const } };
        const e = { ...ep("urn:shop:x"), input: { params: [p, { ...p }] } };
        const errs = validateSource(source({ endpoints: [e] }));
        expect(errs.some(m => m.includes("duplicate param"))).toBe(true);
    });
    test("header-param with a forbidden name (host/cookie) is rejected", () => {
        const e = { ...ep("urn:shop:x"), input: { params: [{ name: "Host", in: "header" as const, schema: { type: "string" as const } }] } };
        const errs = validateSource(source({ endpoints: [e] }));
        expect(errs.some(m => m.includes("forbidden or invalid header param"))).toBe(true);
    });
    test("computed userID is valid for query and header params", () => {
        const e = { ...ep("urn:shop:x"), input: { params: [
            { name: "user_id", in: "query" as const, source: { from: "computed" as const, ref: "userID" as const }, schema: { type: "string" as const } },
            { name: "X-User-ID", in: "header" as const, source: { from: "computed" as const, ref: "userID" as const }, schema: { type: "string" as const } },
        ] } };
        expect(validateSource(source({ endpoints: [e] }))).toEqual([]);
    });
    test("computed params reject path and unknown refs", () => {
        const e = { ...ep("urn:shop:x"), input: { params: [
            { name: "id", in: "path" as const, source: { from: "computed" as const, ref: "userID" as const }, schema: { type: "string" as const } },
            { name: "email", in: "query" as const, source: { from: "computed" as const, ref: "email" as any }, schema: { type: "string" as const } },
        ] } };
        const errs = validateSource(source({ endpoints: [e] }));
        expect(errs.some(m => m.includes("computed param is not supported"))).toBe(true);
        expect(errs.some(m => m.includes("invalid computed ref"))).toBe(true);
    });
    test("config header: forbidden name, control-char value, secret without ref", () => {
        const e = { ...ep("urn:shop:x"), headers: [
            { name: "cookie",   source: { from: "static" as const, value: "x" } },
            { name: "X-Bad",    source: { from: "static" as const, value: "a\r\nb" } },
            { name: "X-Secret", source: { from: "secret" as const, ref: "" } },
        ] };
        const errs = validateSource(source({ endpoints: [e] }));
        expect(errs.some(m => m.includes("forbidden or invalid header name"))).toBe(true);
        expect(errs.some(m => m.includes("invalid header value"))).toBe(true);
        expect(errs.some(m => m.includes("secret header without ref"))).toBe(true);
    });
    test("duplicate header name (case-insensitive)", () => {
        const e = { ...ep("urn:shop:x"), headers: [
            { name: "X-Api-Key", source: { from: "static" as const, value: "a" } },
            { name: "x-api-key", source: { from: "static" as const, value: "b" } },
        ] };
        const errs = validateSource(source({ endpoints: [e] }));
        expect(errs.some(m => m.includes("duplicate header"))).toBe(true);
    });
    test("computed config header accepts userID and rejects unknown refs", () => {
        const good = { ...ep("urn:shop:x"), headers: [
            { name: "X-User-ID", source: { from: "computed" as const, ref: "userID" as const } },
        ] };
        expect(validateSource(source({ endpoints: [good] }))).toEqual([]);

        const bad = { ...ep("urn:shop:x"), headers: [
            { name: "X-User-Email", source: { from: "computed" as const, ref: "email" as any } },
        ] };
        const errs = validateSource(source({ endpoints: [bad] }));
        expect(errs.some(m => m.includes("invalid computed ref"))).toBe(true);
    });
    test("secret config header accepts safe prefix and rejects control chars", () => {
        const good = { ...ep("urn:shop:x"), headers: [
            { name: "Authorization", source: { from: "secret" as const, ref: "${KEY}", prefix: "Bearer " } },
        ] };
        expect(validateSource(source({ endpoints: [good] }))).toEqual([]);

        const bad = { ...ep("urn:shop:x"), headers: [
            { name: "Authorization", source: { from: "secret" as const, ref: "${KEY}", prefix: "Bearer \n" } },
        ] };
        const errs = validateSource(source({ endpoints: [bad] }));
        expect(errs.some(m => m.includes("invalid header prefix"))).toBe(true);
    });
    test("invalid + duplicate response status", () => {
        const e = { ...ep("urn:shop:x"), output: [{ status: "200" }, { status: "200" }, { status: "2xx" }] };
        const errs = validateSource(source({ endpoints: [e] }));
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
        expect(validateSource(source({ endpoints: [e] }))).toEqual([]);
    });
});

describe("endpointBelongsToSource", () => {
    test("match", () => expect(endpointBelongsToSource("urn:shop:getCart", "urn:shop")).toBe(true));
    test("mismatch", () => expect(endpointBelongsToSource("urn:other:getCart", "urn:shop")).toBe(false));
    test("a source urn is not an endpoint → false", () =>
        expect(endpointBelongsToSource("urn:shop", "urn:shop")).toBe(false));
});
