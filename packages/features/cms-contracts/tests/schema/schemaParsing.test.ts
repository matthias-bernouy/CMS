import { describe, expect, test } from "bun:test";
import { ReleaseValidationError } from "@bernouy/cms-contracts";
import { parseUlviaSchema } from "@bernouy/cms-contracts/schema";
import { objectSchema, stringSchema } from "../support/fixtures";

describe("ulvia-schema/v1 parsing", () => {
    test("parses closed objects, bounded arrays, maps, and binary values", () => {
        const schema = parseUlviaSchema(
            objectSchema(
                {
                    title: stringSchema(120),
                    tags: { type: "array", maxItems: 10, items: stringSchema(30) },
                    attributes: {
                        type: "map",
                        maxKeyLength: 40,
                        maxProperties: 20,
                        values: stringSchema(200),
                    },
                    attachment: { type: "binary", maxBytes: 1024, mediaTypes: ["application/pdf"] },
                },
                ["title"],
            ),
        );

        expect(schema.type).toBe("object");
        expect(Object.isFrozen(schema)).toBe(true);
    });

    test("requires explicit bounds for expandable values", () => {
        expect(() => parseUlviaSchema({ type: "string" })).toThrow("required for bounded strings");
        expect(() => parseUlviaSchema({ type: "array", items: stringSchema() })).toThrow("maxItems");
        expect(() => parseUlviaSchema({ type: "map", maxKeyLength: 20, values: stringSchema() })).toThrow(
            "maxProperties",
        );
        expect(() => parseUlviaSchema({ type: "binary", maxBytes: 100, mediaTypes: [] })).toThrow("non-empty");
    });

    test("accepts declared custom media types without a global allowlist", () => {
        expect(
            parseUlviaSchema({
                type: "binary",
                maxBytes: 100,
                mediaTypes: ["application/vnd.ulvia.report+json"],
            }),
        ).toMatchObject({ mediaTypes: ["application/vnd.ulvia.report+json"] });
        expect(() => parseUlviaSchema({ type: "binary", maxBytes: 100, mediaTypes: ["application/*"] })).toThrow(
            "lowercase media type without parameters",
        );
    });

    test("rejects undeclared required properties and arbitrary schema keywords", () => {
        expect(() => parseUlviaSchema(objectSchema({ title: stringSchema() }, ["missing"]))).toThrow(
            'unknown property "missing"',
        );
        expect(() => parseUlviaSchema({ type: "string", maxLength: 20, pattern: ".*" })).toThrow(
            'unknown property "pattern"',
        );
    });

    test("enforces release-wide schema node limits", () => {
        expect(() =>
            parseUlviaSchema(objectSchema({ first: stringSchema(), second: stringSchema() }), {
                maxArrayItems: 10,
                maxBinaryBytes: 100,
                maxCapabilities: 10,
                maxDocumentBytes: 10_000,
                maxEnumValues: 10,
                maxJsonDepth: 10,
                maxProperties: 10,
                maxSchemaDepth: 10,
                maxSchemaNodes: 2,
                maxStringLength: 1000,
            }),
        ).toThrow(ReleaseValidationError);
    });

    test("accepts an empty string when the declared bounds allow it", () => {
        const schema = parseUlviaSchema({ type: "string", maxLength: 10, enum: [""] });

        expect(schema).toMatchObject({ type: "string", enum: [""] });
    });

    test("validates enum members against the declared string format", () => {
        expect(() => parseUlviaSchema({ type: "string", format: "date", maxLength: 10, enum: ["2025-02-29"] })).toThrow(
            "must match format date",
        );
    });

    test("rejects sparse arrays at the standalone schema boundary", () => {
        expect(() => parseUlviaSchema({ type: "string", maxLength: 10, enum: Array(1) })).toThrow("must not be sparse");
        expect(() => parseUlviaSchema({ type: "binary", maxBytes: 10, mediaTypes: Array(1) })).toThrow(
            "must not be sparse",
        );
    });
});
