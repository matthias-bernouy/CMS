import { describe, expect, test } from "bun:test";
import { validateSource } from "cms-sources/core/validateSource";
import { ep, source } from "./helpers/sourceValidationFixtures";

describe("validateSource", () => {
    test("validates source and endpoint identity", () => {
        expect(validateSource(source())).toEqual([]);
        expect(validateSource(source({ urn: "shop" })).some(e => e.includes("invalid source urn"))).toBe(true);
        expect(validateSource(source({ urn: "urn:system-custom", endpoints: [ep("urn:system-custom:x")] })).some(e => e.includes("reserved"))).toBe(true);
        expect(validateSource(source({ endpoints: [ep("urn:other:x")] })).some(e => e.includes("does not belong"))).toBe(true);
        expect(validateSource(source({ endpoints: [ep("urn:shop")] })).some(e => e.includes("invalid endpoint urn"))).toBe(true);
        expect(validateSource(source({ endpoints: [ep("urn:shop:a"), ep("urn:shop:a")] })).some(e => e.includes("duplicate"))).toBe(true);
    });

    test("validates endpoint method and access mode", () => {
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), method: "FETCH" as any }] })).some(e => e.includes("invalid method"))).toBe(true);
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), access: { mode: "public" } }] }))).toEqual([]);
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), access: { mode: "visitor" as any } }] })).some(e => e.includes("invalid access mode"))).toBe(true);
    });

    test("validates params", () => {
        const duplicate = { name: "q", in: "query" as const, schema: { type: "string" as const } };
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), input: { params: [{ name: "q", in: "cookie" as any, schema: { type: "string" as const } }] } }] })).some(e => e.includes("invalid param location"))).toBe(true);
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), input: { params: [duplicate, { ...duplicate }] } }] })).some(e => e.includes("duplicate param"))).toBe(true);
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), input: { params: [{ name: "Host", in: "header" as const, schema: { type: "string" as const } }] } }] })).some(e => e.includes("forbidden or invalid header param"))).toBe(true);
    });

    test("validates computed params", () => {
        const good = { ...ep("urn:shop:x"), input: { params: [
            { name: "user_id", in: "query" as const, source: { from: "computed" as const, ref: "userID" as const }, schema: { type: "string" as const } },
            { name: "X-User-ID", in: "header" as const, source: { from: "computed" as const, ref: "userID" as const }, schema: { type: "string" as const } },
        ] } };
        expect(validateSource(source({ endpoints: [good] }))).toEqual([]);

        const bad = { ...ep("urn:shop:x"), input: { params: [
            { name: "id", in: "path" as const, source: { from: "computed" as const, ref: "userID" as const }, schema: { type: "string" as const } },
            { name: "email", in: "query" as const, source: { from: "computed" as const, ref: "email" as any }, schema: { type: "string" as const } },
        ] } };
        const errors = validateSource(source({ endpoints: [bad] }));
        expect(errors.some(e => e.includes("computed param is not supported"))).toBe(true);
        expect(errors.some(e => e.includes("invalid computed ref"))).toBe(true);
    });

    test("validates headers", () => {
        const bad = { ...ep("urn:shop:x"), headers: [
            { name: "cookie", source: { from: "static" as const, value: "x" } },
            { name: "X-Bad", source: { from: "static" as const, value: "a\r\nb" } },
            { name: "X-Secret", source: { from: "secret" as const, ref: "" } },
            { name: "X-User-Email", source: { from: "computed" as const, ref: "email" as any } },
        ] };
        const errors = validateSource(source({ endpoints: [bad] }));
        expect(errors.some(e => e.includes("forbidden or invalid header name"))).toBe(true);
        expect(errors.some(e => e.includes("invalid header value"))).toBe(true);
        expect(errors.some(e => e.includes("secret header without ref"))).toBe(true);
        expect(errors.some(e => e.includes("invalid computed ref"))).toBe(true);
    });

    test("validates duplicate headers, secret prefixes, and responses", () => {
        const endpoint = { ...ep("urn:shop:x"), headers: [
            { name: "X-Api-Key", source: { from: "static" as const, value: "a" } },
            { name: "x-api-key", source: { from: "static" as const, value: "b" } },
            { name: "Authorization", source: { from: "secret" as const, ref: "${KEY}", prefix: "Bearer \n" } },
        ], output: [{ status: "200" }, { status: "200" }, { status: "2xx" }] };
        const errors = validateSource(source({ endpoints: [endpoint] }));
        expect(errors.some(e => e.includes("duplicate header"))).toBe(true);
        expect(errors.some(e => e.includes("invalid header prefix"))).toBe(true);
        expect(errors.some(e => e.includes("invalid response status"))).toBe(true);
        expect(errors.some(e => e.includes("duplicate response status"))).toBe(true);
    });

    test("accepts file endpoints and fully-furnished endpoints", () => {
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:file"), responseKind: "file", mediaType: "image/*" }] }))).toEqual([]);
        const endpoint = { ...ep("urn:shop:x"), input: { params: [{ name: "X-Trace-Id", in: "header" as const, schema: { type: "string" as const } }] }, headers: [{ name: "Authorization", source: { from: "secret" as const, ref: "${KEY}" } }], output: [{ status: "200" }, { status: "default" }] };
        expect(validateSource(source({ endpoints: [endpoint] }))).toEqual([]);
    });
});
