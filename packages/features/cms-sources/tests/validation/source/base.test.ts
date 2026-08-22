import { describe, expect, test } from "bun:test";
import { validateSource } from "@bernouy/cms-sources";
import { ep, source } from "../../helpers/sourceValidationFixtures";

describe("validateSource endpoint identity and configuration", () => {
    test("validates source and endpoint identity", () => {
        expect(validateSource(source())).toEqual([]);
        expect(validateSource(source({ urn: "shop" })).some((error) => error.includes("invalid source urn"))).toBe(
            true,
        );
        const reserved = source({ urn: "urn:system-custom", endpoints: [ep("urn:system-custom:x")] });
        expect(validateSource(reserved).some((error) => error.includes("reserved"))).toBe(true);
        expect(
            validateSource(source({ endpoints: [ep("urn:other:x")] })).some((error) =>
                error.includes("does not belong"),
            ),
        ).toBe(true);
        expect(
            validateSource(source({ endpoints: [ep("urn:shop")] })).some((error) =>
                error.includes("invalid endpoint urn"),
            ),
        ).toBe(true);
        const duplicate = source({ endpoints: [ep("urn:shop:a"), ep("urn:shop:a")] });
        expect(validateSource(duplicate).some((error) => error.includes("duplicate"))).toBe(true);
    });

    test("validates endpoint method and access mode", () => {
        const invalidMethod = source({ endpoints: [{ ...ep("urn:shop:x"), method: "FETCH" as any }] });
        expect(validateSource(invalidMethod).some((error) => error.includes("invalid method"))).toBe(true);
        const publicEndpoint = source({ endpoints: [{ ...ep("urn:shop:x"), access: { mode: "public" } }] });
        expect(validateSource(publicEndpoint)).toEqual([]);
        const invalidAccess = source({ endpoints: [{ ...ep("urn:shop:x"), access: { mode: "visitor" as any } }] });
        expect(validateSource(invalidAccess).some((error) => error.includes("invalid access mode"))).toBe(true);
    });

    test("validates bounded endpoint timeout overrides", () => {
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), timeoutMs: 60_000 }] }))).toEqual([]);
        for (const timeoutMs of [0, 1.5, 120_001, Number.NaN]) {
            const errors = validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), timeoutMs }] }));
            expect(errors.some((error) => error.includes("invalid timeoutMs"))).toBe(true);
        }
    });

    test("keeps legacy stored role metadata readable during migration", () => {
        const access = { mode: "admin", roles: ["legacy-role"] } as any;
        expect(validateSource(source({ endpoints: [{ ...ep("urn:shop:x"), access }] }))).toEqual([]);
    });

    test("accepts file endpoints and fully furnished endpoints", () => {
        const file = source({ endpoints: [{ ...ep("urn:shop:file"), responseKind: "file", mediaType: "image/*" }] });
        expect(validateSource(file)).toEqual([]);
        const endpoint = {
            ...ep("urn:shop:x"),
            input: { params: [{ name: "X-Trace-Id", in: "header" as const, schema: { type: "string" as const } }] },
            headers: [{ name: "Authorization", source: { from: "secret" as const, ref: "${KEY}" } }],
            output: [{ status: "200" }, { status: "default" }],
        };
        expect(validateSource(source({ endpoints: [endpoint] }))).toEqual([]);
    });
});
