import { describe, test, expect } from "bun:test";
import { flattenScalars } from "cms-control/core/editorSystem/extensions/schemaScalars";
import type { JSONSchema } from "@bernouy/cms-gateway";

describe("flattenScalars", () => {

    test("returns [] for null / undefined", () => {
        expect(flattenScalars(null)).toEqual([]);
        expect(flattenScalars(undefined)).toEqual([]);
    });

    test("primitive at root emits an empty-path field (value-as-source)", () => {
        expect(flattenScalars({ type: "string" })).toEqual([
            { path: "", label: "value", type: "string" },
        ]);
    });

    test("object recurses into properties", () => {
        const s: JSONSchema = {
            type: "object",
            properties: {
                name: { type: "string" },
                age:  { type: "integer" },
            },
        };
        expect(flattenScalars(s).sort(byPath)).toEqual([
            { path: "age",  label: "age",  type: "integer" },
            { path: "name", label: "name", type: "string"  },
        ]);
    });

    test("nested object produces dotted paths", () => {
        const s: JSONSchema = {
            type: "object",
            properties: {
                user: {
                    type: "object",
                    properties: { name: { type: "string" } },
                },
            },
        };
        expect(flattenScalars(s)).toEqual([
            { path: "user.name", label: "name", type: "string" },
        ]);
    });

    test("array surfaces only `<path>.length` (items belong to iteration)", () => {
        const s: JSONSchema = {
            type: "object",
            properties: {
                items: { type: "array", items: { type: "string" } },
            },
        };
        expect(flattenScalars(s)).toEqual([
            { path: "items.length", label: "length", type: "integer" },
        ]);
    });

    test("enum is treated as a scalar of the enum's underlying type", () => {
        const s: JSONSchema = {
            type: "object",
            properties: {
                tone: { type: "string", enum: ["light", "dark"] },
            },
        };
        expect(flattenScalars(s)).toEqual([
            { path: "tone", label: "tone", type: "string" },
        ]);
    });

    test("allOf merges properties before walking", () => {
        const s: JSONSchema = {
            allOf: [
                { type: "object", properties: { a: { type: "string" } } },
                { type: "object", properties: { b: { type: "number" } } },
            ],
        };
        expect(flattenScalars(s).sort(byPath)).toEqual([
            { path: "a", label: "a", type: "string" },
            { path: "b", label: "b", type: "number" },
        ]);
    });

    test("oneOf picks the first variant", () => {
        const s: JSONSchema = {
            oneOf: [
                { type: "object", properties: { a: { type: "string" } } },
                { type: "object", properties: { b: { type: "number" } } },
            ],
        };
        expect(flattenScalars(s)).toEqual([
            { path: "a", label: "a", type: "string" },
        ]);
    });

    test("anyOf picks the first variant", () => {
        const s: JSONSchema = {
            anyOf: [
                { type: "object", properties: { x: { type: "boolean" } } },
                { type: "string" },
            ],
        };
        expect(flattenScalars(s)).toEqual([
            { path: "x", label: "x", type: "boolean" },
        ]);
    });
});

function byPath(a: { path: string }, b: { path: string }): number {
    return a.path.localeCompare(b.path);
}
