import { describe, test, expect } from "bun:test";
import { initFromSchema } from "src/control/components/data/JsonEditor/initFromSchema";
import type { JSONSchema } from "src/control/core/data/types";

describe("initFromSchema", () => {
    test("returns null for null / unsupported schemas", () => {
        expect(initFromSchema(null)).toBeNull();
        expect(initFromSchema({} as JSONSchema)).toBeNull();
    });

    test("primitives initialize to their zero value", () => {
        expect(initFromSchema({ type: "string" })).toBe("");
        expect(initFromSchema({ type: "number" })).toBe(0);
        expect(initFromSchema({ type: "integer" })).toBe(0);
        expect(initFromSchema({ type: "boolean" })).toBe(false);
        expect(initFromSchema({ type: "null" })).toBeNull();
    });

    test("enum picks the first declared value", () => {
        expect(initFromSchema({ type: "string", enum: ["red", "green", "blue"] })).toBe("red");
    });

    test("object recurses into properties", () => {
        const s: JSONSchema = {
            type: "object",
            properties: {
                name:    { type: "string" },
                age:     { type: "integer" },
                active:  { type: "boolean" },
                tags:    { type: "array", items: { type: "string" } },
            },
        };
        expect(initFromSchema(s)).toEqual({
            name:   "",
            age:    0,
            active: false,
            tags:   [""],
        });
    });

    test("array seeds one item from `items`", () => {
        const s: JSONSchema = { type: "array", items: { type: "object", properties: { id: { type: "integer" } } } };
        expect(initFromSchema(s)).toEqual([{ id: 0 }]);
    });

    test("oneOf takes the first variant", () => {
        const s: JSONSchema = {
            oneOf: [
                { type: "string" },
                { type: "integer" },
            ],
        };
        expect(initFromSchema(s)).toBe("");
    });

    test("anyOf takes the first variant too", () => {
        const s: JSONSchema = {
            anyOf: [
                { type: "boolean" },
                { type: "string" },
            ],
        };
        expect(initFromSchema(s)).toBe(false);
    });

    test("allOf merges then initializes the merged shape", () => {
        const s: JSONSchema = {
            allOf: [
                { type: "object", properties: { a: { type: "string" } } },
                { type: "object", properties: { b: { type: "number" } } },
            ],
        };
        expect(initFromSchema(s)).toEqual({ a: "", b: 0 });
    });
});
