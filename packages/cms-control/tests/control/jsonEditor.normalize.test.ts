import { describe, test, expect } from "bun:test";
import { normalize } from "cms-control/components/data/JsonEditor/normalize";
import type { JSONSchema } from "cms-control/core/data/types";

describe("normalize", () => {
    test("returns null for null/undefined input", () => {
        expect(normalize(null)).toBeNull();
        expect(normalize(undefined)).toBeNull();
    });

    test("passes a plain schema through unchanged", () => {
        const s: JSONSchema = { type: "string" };
        expect(normalize(s)).toBe(s);
    });

    test("merges allOf properties from every part", () => {
        const s: JSONSchema = {
            allOf: [
                { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
                { type: "object", properties: { b: { type: "number" } }, required: ["b"] },
            ],
        };
        const merged = normalize(s)!;
        expect(merged.type).toBe("object");
        expect(Object.keys(merged.properties ?? {}).sort()).toEqual(["a", "b"]);
        expect(merged.required?.sort()).toEqual(["a", "b"]);
    });

    test("allOf last-wins on duplicate property keys", () => {
        const s: JSONSchema = {
            allOf: [
                { type: "object", properties: { a: { type: "string" } } },
                { type: "object", properties: { a: { type: "number" } } },
            ],
        };
        const merged = normalize(s)!;
        expect(merged.properties?.a?.type).toBe("number");
    });

    test("allOf surfaces nullable when any part declares it", () => {
        const s: JSONSchema = {
            allOf: [
                { type: "object", properties: { a: { type: "string" } } },
                { nullable: true } as JSONSchema,
            ],
        };
        const merged = normalize(s)!;
        expect(merged.nullable).toBe(true);
    });
});
