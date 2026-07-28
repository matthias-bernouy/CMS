import { describe, expect, test } from "bun:test";
import { parseConnectorFunctionHttpDataShape } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations connector function response shape", () => {
    test("preserves and normalizes the supported public validation contract", () => {
        expect(
            parseConnectorFunctionHttpDataShape(
                {
                    type: "object",
                    nullable: false,
                    required: ["state", "items"],
                    properties: {
                        state: {
                            type: "string",
                            enum: ["pending", "active"],
                            format: "hostname",
                            pattern: "^[a-z]+$",
                            minLength: 1,
                            maxLength: 32,
                        },
                        score: { type: "number", enum: [2, 1], minimum: 0, maximum: 10 },
                        enabled: { type: "boolean", enum: [true, false] },
                        items: {
                            type: "array",
                            minItems: 1,
                            maxItems: 5,
                            items: { type: "string", format: "uuid" },
                        },
                    },
                },
                "response.body",
            ),
        ).toEqual({
            type: "object",
            nullable: false,
            properties: {
                enabled: { type: "boolean", enum: [false, true] },
                items: {
                    type: "array",
                    items: { type: "string", format: "uuid" },
                    minItems: 1,
                    maxItems: 5,
                },
                score: { type: "number", enum: [1, 2], minimum: 0, maximum: 10 },
                state: {
                    type: "string",
                    enum: ["active", "pending"],
                    format: "hostname",
                    pattern: "^[a-z]+$",
                    minLength: 1,
                    maxLength: 32,
                },
            },
            required: ["items", "state"],
        });
    });

    test.each([
        ["unknown keyword", { type: "string", minLenght: 1 }, /minLenght.*not supported/],
        ["keyword on wrong type", { type: "number", minLength: 1 }, /minLength.*not supported/],
        ["wrong enum type", { type: "string", enum: ["ready", 1] }, /enum\.1.*must be a string/],
        ["duplicate enum", { type: "number", enum: [1, 1] }, /duplicate value 1/],
        ["unsupported format", { type: "string", format: "custom" }, /must be one of/],
        ["invalid pattern", { type: "string", pattern: "[" }, /valid ECMAScript regular expression/],
        ["reversed string bounds", { type: "string", minLength: 3, maxLength: 2 }, /greater than or equal/],
        ["fractional array bound", { type: "array", minItems: 0.5 }, /non-negative safe integer/],
        [
            "undeclared required property",
            { type: "object", properties: {}, required: ["missing"] },
            /undeclared property "missing"/,
        ],
        ["object-only keyword on array", { type: "array", properties: {} }, /properties.*not supported/],
    ])("rejects %s", (_label, shape, expected) => {
        expect(() => parseConnectorFunctionHttpDataShape(shape, "response.body")).toThrow(expected as RegExp);
    });

    test("bounds recursive response contracts", () => {
        let shape: Record<string, unknown> = { type: "string" };
        for (let index = 0; index < 10; index += 1) {
            shape = { type: "array", items: shape };
        }

        expect(() => parseConnectorFunctionHttpDataShape(shape, "response.body")).toThrow(/nested more than 10 levels/);
    });
});
