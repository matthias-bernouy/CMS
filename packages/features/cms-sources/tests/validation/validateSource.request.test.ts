import { describe, expect, test } from "bun:test";
import { validateSource } from "cms-sources/core/validation/validateSource";
import { ep, source } from "../helpers/sourceValidationFixtures";

describe("validateSource request contracts", () => {
    test("validates params", () => {
        const duplicate = { name: "q", in: "query" as const, schema: { type: "string" as const } };
        const invalidLocation = source({
            endpoints: [{ ...ep("urn:shop:x"), input: { params: [{ ...duplicate, in: "cookie" as any }] } }],
        });
        expect(validateSource(invalidLocation).some((error) => error.includes("invalid param location"))).toBe(true);
        const duplicates = source({
            endpoints: [{ ...ep("urn:shop:x"), input: { params: [duplicate, { ...duplicate }] } }],
        });
        expect(validateSource(duplicates).some((error) => error.includes("duplicate param"))).toBe(true);
        const forbiddenHeader = source({
            endpoints: [
                {
                    ...ep("urn:shop:x"),
                    input: { params: [{ name: "Host", in: "header", schema: { type: "string" } }] },
                },
            ],
        });
        expect(
            validateSource(forbiddenHeader).some((error) => error.includes("forbidden or invalid header param")),
        ).toBe(true);
    });

    test("validates computed params", () => {
        const computed = (name: string, location: "query" | "header" | "path", ref: "userID" | "userRole") => ({
            name,
            in: location,
            source: { from: "computed" as const, ref },
            schema: { type: "string" as const },
        });
        const valid = {
            ...ep("urn:shop:x"),
            input: { params: [computed("user_id", "query", "userID"), computed("X-Role", "header", "userRole")] },
        };
        expect(validateSource(source({ endpoints: [valid] }))).toEqual([]);
        const invalid = {
            ...ep("urn:shop:x"),
            input: {
                params: [
                    computed("id", "path", "userID"),
                    {
                        ...computed("email", "query", "userID"),
                        source: { from: "computed" as const, ref: "email" as any },
                    },
                ],
            },
        };
        const errors = validateSource(source({ endpoints: [invalid] }));
        expect(errors.some((error) => error.includes("computed param is not supported"))).toBe(true);
        expect(errors.some((error) => error.includes("invalid computed ref"))).toBe(true);
    });

    test("validates configured headers", () => {
        const endpoint = {
            ...ep("urn:shop:x"),
            headers: [
                { name: "cookie", source: { from: "static" as const, value: "x" } },
                { name: "X-Bad", source: { from: "static" as const, value: "a\r\nb" } },
                { name: "X-Secret", source: { from: "secret" as const, ref: "" } },
                { name: "X-User-Email", source: { from: "computed" as const, ref: "email" as any } },
            ],
        };
        const errors = validateSource(source({ endpoints: [endpoint] }));
        expect(errors.some((error) => error.includes("forbidden or invalid header name"))).toBe(true);
        expect(errors.some((error) => error.includes("invalid header value"))).toBe(true);
        expect(errors.some((error) => error.includes("secret header without ref"))).toBe(true);
        expect(errors.some((error) => error.includes("invalid computed ref"))).toBe(true);

        const reserved = source({
            endpoints: [
                {
                    ...ep("urn:shop:reserved"),
                    headers: [
                        {
                            name: "x-cms-correlation-id",
                            source: { from: "static" as const, value: "override" },
                        },
                    ],
                },
            ],
        });
        expect(validateSource(reserved).some((error) => error.includes("forbidden or invalid header name"))).toBe(true);
    });

    test("validates duplicate headers, secret prefixes, and response contracts", () => {
        const endpoint = {
            ...ep("urn:shop:x"),
            headers: [
                { name: "X-Api-Key", source: { from: "static" as const, value: "a" } },
                { name: "x-api-key", source: { from: "static" as const, value: "b" } },
                { name: "Authorization", source: { from: "secret" as const, ref: "${KEY}", prefix: "Bearer \n" } },
            ],
            output: [{ status: "200" }, { status: "200" }, { status: "2xx" }],
        };
        const errors = validateSource(source({ endpoints: [endpoint] }));
        expect(errors.some((error) => error.includes("duplicate header"))).toBe(true);
        expect(errors.some((error) => error.includes("invalid header prefix"))).toBe(true);
        expect(errors.some((error) => error.includes("invalid response status"))).toBe(true);
        expect(errors.some((error) => error.includes("duplicate response status"))).toBe(true);
        const missing = validateSource(source({ endpoints: [{ ...ep("urn:shop:missingOutput"), output: undefined }] }));
        expect(missing.some((error) => error.includes("missing response contract"))).toBe(true);
    });
});
