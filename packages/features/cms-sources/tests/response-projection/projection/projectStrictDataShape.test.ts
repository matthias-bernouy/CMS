import { describe, expect, test } from "bun:test";
import { DataShapeProjectionError, projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";

describe("projectStrictDataShape", () => {
    test("accepts root null only when the shape explicitly declares it nullable", () => {
        expect(projectStrictDataShape(null, { type: "string", nullable: true })).toBeNull();
        expect(() => projectStrictDataShape(null, { type: "string" })).toThrow(DataShapeProjectionError);
        expect(() => projectStrictDataShape(null, { type: "string", nullable: false })).toThrow(
            DataShapeProjectionError,
        );
    });

    test("applies nullable recursively to properties and array items", () => {
        const shape: DataShape = {
            type: "object",
            properties: {
                optionalNullable: { type: "string", nullable: true },
                requiredNullable: { type: "string", nullable: true },
                values: {
                    type: "array",
                    items: { type: "number", nullable: true },
                },
            },
            required: ["requiredNullable"],
        };

        expect(
            projectStrictDataShape(
                {
                    optionalNullable: null,
                    requiredNullable: null,
                    values: [1, null],
                    privateValue: "drop",
                },
                shape,
            ),
        ).toEqual({
            optionalNullable: null,
            requiredNullable: null,
            values: [1, null],
        });
    });

    test("rejects present null values unless their nested shape is nullable", () => {
        expect(() =>
            projectStrictDataShape(
                { value: null },
                {
                    type: "object",
                    properties: { value: { type: "string" } },
                },
            ),
        ).toThrow("body.value must be a string");

        expect(() =>
            projectStrictDataShape([1, null], {
                type: "array",
                items: { type: "number", nullable: false },
            }),
        ).toThrow("body.1 must be a number");
    });

    test("still requires the presence of required nullable properties", () => {
        expect(() =>
            projectStrictDataShape(
                {},
                {
                    type: "object",
                    properties: { value: { type: "string", nullable: true } },
                    required: ["value"],
                },
            ),
        ).toThrow("body.value is required");
    });
});
