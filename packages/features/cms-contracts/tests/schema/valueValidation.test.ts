import { describe, expect, test } from "bun:test";
import {
    parseUlviaSchema,
    projectSchemaValue,
    SchemaValueError,
    validateSchemaValue,
} from "@bernouy/cms-contracts/schema";
import { objectSchema, stringSchema } from "../support/fixtures";

describe("ulvia-schema/v1 value validation", () => {
    const schema = parseUlviaSchema(
        objectSchema(
            {
                email: { type: "string", format: "email", maxLength: 320 },
                locale: { type: "string", maxLength: 10, nullable: true },
                attempts: { type: "integer", minimum: 0, maximum: 3 },
                metadata: { type: "map", maxKeyLength: 20, maxProperties: 2, values: stringSchema(30) },
            },
            ["email", "attempts"],
        ),
    );

    test("accepts a conforming value", () => {
        expect(() =>
            validateSchemaValue(schema, {
                email: "author@example.test",
                locale: null,
                attempts: 1,
                metadata: { campaign: "welcome" },
            }),
        ).not.toThrow();
    });

    test("rejects undeclared fields, bad formats, and map overflow", () => {
        expect(() => validateSchemaValue(schema, { email: "bad", attempts: 1 })).toThrow(SchemaValueError);
        expect(() => validateSchemaValue(schema, { email: "a@b.test", attempts: 1, extra: true })).toThrow(
            "undeclared property",
        );
        expect(() =>
            validateSchemaValue(schema, {
                email: "a@b.test",
                attempts: 1,
                metadata: { one: "1", two: "2", three: "3" },
            }),
        ).toThrow("entry count");
    });

    test("rejects normalized but impossible calendar dates", () => {
        const dateSchema = parseUlviaSchema({ type: "string", format: "date", maxLength: 10 });
        const dateTimeSchema = parseUlviaSchema({ type: "string", format: "date-time", maxLength: 40 });

        expect(() => validateSchemaValue(dateSchema, "2025-02-29")).toThrow("must match format date");
        expect(() => validateSchemaValue(dateTimeSchema, "2024-04-31T12:00:00Z")).toThrow(
            "must match format date-time",
        );
        expect(() => validateSchemaValue(dateSchema, "2024-02-29")).not.toThrow();
    });

    test("rejects sparse arrays instead of skipping absent items", () => {
        const arraySchema = parseUlviaSchema({
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: { type: "string", maxLength: 20 },
        });

        expect(() => validateSchemaValue(arraySchema, Array(1))).toThrow("missing array item 0");
    });

    test("does not resolve undeclared properties through the schema prototype", () => {
        const parsed = parseUlviaSchema({
            type: "object",
            properties: { declared: { type: "string", maxLength: 20 } },
            required: [],
        });
        const restored = JSON.parse(JSON.stringify(parsed));

        expect(() => validateSchemaValue(restored, { toString: "shadowed" })).toThrow("undeclared property");
    });

    test("projects undeclared provider fields recursively", () => {
        const projected = projectSchemaValue(schema, {
            email: "author@example.test",
            attempts: 1,
            metadata: { campaign: "welcome" },
            providerSecret: "removed",
        });

        expect(projected).toEqual({
            email: "author@example.test",
            attempts: 1,
            metadata: { campaign: "welcome" },
        });
    });

    test("rejects oversized containers before projecting their values", () => {
        const arraySchema = parseUlviaSchema({
            type: "array",
            maxItems: 1,
            items: stringSchema(10),
        });
        const oversizedArray = Array(2);
        Object.defineProperty(oversizedArray, 0, {
            enumerable: true,
            get: () => {
                throw new Error("array item was projected");
            },
        });
        const mapSchema = parseUlviaSchema({
            type: "map",
            maxKeyLength: 10,
            maxProperties: 1,
            values: stringSchema(10),
        });
        const oversizedMap = Object.defineProperties(
            {},
            {
                first: {
                    enumerable: true,
                    get: () => {
                        throw new Error("map value was projected");
                    },
                },
                second: { enumerable: true, value: "value" },
            },
        );

        expect(() => projectSchemaValue(arraySchema, oversizedArray)).toThrow("entry count");
        expect(() => projectSchemaValue(mapSchema, oversizedMap)).toThrow("entry count");
    });
});
