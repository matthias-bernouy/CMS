import { describe, expect, test } from "bun:test";
import { computeReleaseDigest } from "@bernouy/cms-contracts";
import { parseUlviaSchema, validateSchemaValue } from "@bernouy/cms-contracts/schema";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

describe("obvious non-null schema contradictions", () => {
    test.each([
        { format: "uuid", maxLength: 35 },
        { format: "uuid", minLength: 37, maxLength: 40 },
        { format: "date", maxLength: 9 },
        { format: "date", minLength: 11, maxLength: 20 },
        { format: "date-time", maxLength: 19 },
        { format: "date-time", minLength: 21, maxLength: 21 },
        { format: "email", maxLength: 4 },
        { format: "uri", maxLength: 1 },
    ])("rejects a format without any permitted length: %j", (bounds) => {
        expect(() => parseUlviaSchema({ type: "string", ...bounds })).toThrow("length range admits no value");
    });

    test.each([
        { format: "uuid", value: "550e8400-e29b-41d4-a716-446655440000" },
        { format: "date", value: "2024-02-29" },
        { format: "date-time", value: "2024-02-29T12:00:00Z" },
        { format: "date-time", value: "2024-02-29T12:00:00.1Z" },
        { format: "date-time", value: "2024-02-29T12:00:00+01:00" },
        { format: "email", value: "a@b.c" },
        { format: "uri", value: "a:" },
    ])("preserves inhabited format boundaries: %j", ({ format, value }) => {
        const schema = parseUlviaSchema({ type: "string", format, minLength: value.length, maxLength: value.length });
        expect(() => validateSchemaValue(schema, value)).not.toThrow();
    });

    test("rejects contradictory non-null branches even when optional or nullable", async () => {
        const impossible = { type: "string", format: "uuid", maxLength: 1 };
        expect(() => parseUlviaSchema({ ...impossible, nullable: true })).toThrow("length range admits no value");
        expect(() => parseUlviaSchema(objectSchema({ optional: impossible }))).toThrow("length range admits no value");
        expect(() => parseUlviaSchema({ type: "array", maxItems: 0, items: impossible })).toThrow(
            "length range admits no value",
        );
        await expect(
            computeReleaseDigest(contractDocument({ capabilities: [capabilityDocument({ output: impossible })] })),
        ).rejects.toThrow("length range admits no value");
    });

    test("checks zero-length map keys without rejecting valid empty or single-entry maps", () => {
        const base = { type: "map", maxKeyLength: 0, maxProperties: 2, values: stringSchema() };
        expect(() => parseUlviaSchema({ ...base, minProperties: 2 })).toThrow("at most one map entry");
        expect(() => parseUlviaSchema({ ...base, nullable: true, minProperties: 2 })).toThrow("at most one map entry");
        expect(() => validateSchemaValue(parseUlviaSchema(base), {})).not.toThrow();
        expect(() =>
            validateSchemaValue(parseUlviaSchema({ ...base, minProperties: 1 }), { "": "value" }),
        ).not.toThrow();
        expect(() => validateSchemaValue(parseUlviaSchema({ type: "string", maxLength: 0 }), "")).not.toThrow();
        expect(() =>
            validateSchemaValue(
                parseUlviaSchema({ type: "string", format: "date", maxLength: 10, nullable: true }),
                null,
            ),
        ).not.toThrow();
    });

    test.each([
        { format: "date", value: "2024-02-29" },
        { format: "date-time", value: "2024-02-29T12:00:00Z" },
        { format: "uuid", value: "550e8400-e29b-41d4-a716-446655440000" },
    ])("format validation consumes the complete string: %j", ({ format, value }) => {
        const schema = parseUlviaSchema({ type: "string", format, maxLength: 100 });
        expect(() => validateSchemaValue(schema, `${value}\n`)).toThrow(`must match format ${format}`);
        expect(() => parseUlviaSchema({ type: "string", format, maxLength: 100, enum: [`${value}\n`] })).toThrow(
            `must match format ${format}`,
        );
    });
});
