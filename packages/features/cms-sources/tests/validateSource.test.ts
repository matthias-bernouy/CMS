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
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), access: { mode: "admin", roles: ["support", "finance"] } }] }))).toEqual([]);
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), access: { mode: "visitor" as any } }] })).some(e => e.includes("invalid access mode"))).toBe(true);
    });

    test("validates bounded endpoint timeout overrides", () => {
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), timeoutMs: 60_000 }] }))).toEqual([]);
        for (const timeoutMs of [0, 1.5, 120_001, Number.NaN]) {
            const errors = validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), timeoutMs }] }));
            expect(errors.some(error => error.includes("invalid timeoutMs"))).toBe(true);
        }
    });

    test("validates explicit endpoint access roles", () => {
        const wrongMode = validateSource(source({ endpoints: [{
            ...ep("urn:shop:wrongMode"),
            access: { mode: "auth", roles: ["support"] },
        }] }));
        expect(wrongMode.some(error => error.includes("require admin mode"))).toBe(true);

        const malformed = validateSource(source({ endpoints: [{
            ...ep("urn:shop:malformed"),
            access: { mode: "admin", roles: ["support", " ", "support"] },
        }] }));
        expect(malformed.some(error => error.includes("non-empty role id"))).toBe(true);
        expect(malformed.some(error => error.includes("duplicate access role"))).toBe(true);

        const nonArray = validateSource(source({ endpoints: [{
            ...ep("urn:shop:nonArray"),
            access: { mode: "admin", roles: "finance" } as any,
        }] }));
        expect(nonArray.some(error => error.includes("expected an array"))).toBe(true);
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
            { name: "X-User-Role", in: "header" as const, source: { from: "computed" as const, ref: "userRole" as const }, schema: { type: "string" as const } },
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
        expect(validateSource(source({
            endpoints: [{ ...ep("urn:shop:missingOutput"), output: undefined }],
        })).some(e => e.includes("missing response contract"))).toBe(true);
    });

    test("accepts file endpoints and fully-furnished endpoints", () => {
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:file"), responseKind: "file", mediaType: "image/*" }] }))).toEqual([]);
        const endpoint = { ...ep("urn:shop:x"), input: { params: [{ name: "X-Trace-Id", in: "header" as const, schema: { type: "string" as const } }] }, headers: [{ name: "Authorization", source: { from: "secret" as const, ref: "${KEY}" } }], output: [{ status: "200" }, { status: "default" }] };
        expect(validateSource(source({ endpoints: [endpoint] }))).toEqual([]);
    });

    test("bounds trigger-only projections to declared JSON responses", () => {
        const triggerBody = { type: "object" as const, properties: { token: { type: "string" as const } } };
        expect(validateSource(source({ endpoints: [{
            ...ep("urn:shop:private"),
            output: [{ status: "200", body: {
                type: "object",
                properties: { id: { type: "string" } },
            }, triggerBody }],
        }] }))).toEqual([]);

        const missingPublicBody = validateSource(source({ endpoints: [{
            ...ep("urn:shop:missingPublicBody"),
            output: [{ status: "200", triggerBody }],
        }] }));
        expect(missingPublicBody.some(error => error.includes("requires a public JSON body"))).toBe(true);

        const fileResponse = validateSource(source({ endpoints: [{
            ...ep("urn:shop:filePrivate"),
            responseKind: "file",
            output: [{ status: "200", body: {
                type: "object",
                properties: { id: { type: "string" } },
            }, triggerBody }],
        }] }));
        expect(fileResponse.some(error => error.includes("not supported for file endpoint"))).toBe(true);

        const unsafeShapes = validateSource(source({ endpoints: [{
            ...ep("urn:shop:unsafePrivate"),
            output: [{
                status: "200",
                body: { type: "object" },
                triggerBody: {
                    type: "object",
                    properties: { envelope: { type: "object" } },
                },
            }],
        }] }));
        expect(unsafeShapes.some(error => error.includes("public response body must be a structured"))).toBe(true);
        expect(unsafeShapes.some(error => error.includes("only structured object fields"))).toBe(true);

        const opaqueArray = validateSource(source({ endpoints: [{
            ...ep("urn:shop:opaqueArray"),
            output: [{
                status: "200",
                body: { type: "object", properties: { id: { type: "string" } } },
                triggerBody: { type: "object", properties: { values: { type: "array" } } },
            }],
        }] }));
        expect(opaqueArray.some(error => error.includes("only structured object fields"))).toBe(true);

        const overlap = validateSource(source({ endpoints: [{
            ...ep("urn:shop:overlappingPrivate"),
            output: [{
                status: "200",
                body: { type: "object", properties: { id: { type: "string" } } },
                triggerBody: { type: "object", properties: { id: { type: "string" } } },
            }],
        }] }));
        expect(overlap.some(error => error.includes("duplicates public field"))).toBe(true);
    });
});
