import { describe, test, expect } from "bun:test";
import { parseDataShape } from "cms-gateway/core/parseDataShape";
import type { DataShape } from "cms-gateway/interfaces/DataShape";

describe("parseDataShape", () => {
    test("scalar leaf passes through", () => {
        expect(parseDataShape({ type: "string" }, "body")).toEqual({ type: "string" });
        expect(parseDataShape({ type: "number" }, "body")).toEqual({ type: "number" });
    });

    test("object with nested properties is preserved", () => {
        const shape: DataShape = { type: "object", properties: { id: { type: "string" }, n: { type: "number" } } };
        expect(parseDataShape(shape, "body")).toEqual(shape);
    });

    test("object `required[]` is preserved, intersected with properties + deduped", () => {
        const shape = { type: "object", properties: { a: { type: "string" }, b: { type: "number" } }, required: ["a", "a", "ghost"] };
        expect(parseDataShape(shape as any, "body")).toEqual({
            type: "object", properties: { a: { type: "string" }, b: { type: "number" } }, required: ["a"],
        } as any);
    });

    test("required entries that aren't OWN properties are dropped (no prototype leakage)", () => {
        const shape = { type: "object", properties: { a: { type: "string" } }, required: ["a", "toString", "hasOwnProperty"] };
        expect(parseDataShape(shape as any, "body")).toEqual({
            type: "object", properties: { a: { type: "string" } }, required: ["a"],
        } as any);
    });

    test("array items are preserved recursively", () => {
        const shape: DataShape = { type: "array", items: { type: "object", properties: { x: { type: "boolean" } } } };
        expect(parseDataShape(shape, "body")).toEqual(shape);
    });

    test("unknown keys are dropped (normalised)", () => {
        const out = parseDataShape({ type: "string", description: "hi", enum: ["a"] } as any, "body");
        expect(out).toEqual({ type: "string" });
    });

    test("empty object properties collapse to a bare object", () => {
        expect(parseDataShape({ type: "object", properties: {} }, "body")).toEqual({ type: "object" });
    });

    test("invalid type → GatewayValidationError", () => {
        expect(() => parseDataShape({ type: "datetime" } as any, "body")).toThrow(/body\.type/);
    });

    test("non-object value → GatewayValidationError", () => {
        expect(() => parseDataShape("nope" as any, "body")).toThrow(/body/);
        expect(() => parseDataShape(["x"] as any, "body")).toThrow(/body/);
    });

    test("unsafe property name (__proto__/constructor/prototype) → GatewayValidationError", () => {
        const props = JSON.parse('{"__proto__": {"type": "string"}}');
        expect(() => parseDataShape({ type: "object", properties: props }, "body")).toThrow(/unsafe property name/);
        expect(() => parseDataShape({ type: "object", properties: { constructor: { type: "string" } } } as any, "body"))
            .toThrow(/unsafe property name/);
    });

    test("empty property name → GatewayValidationError", () => {
        expect(() => parseDataShape({ type: "object", properties: { "": { type: "string" } } }, "body"))
            .toThrow(/body\.properties/);
    });

    test("nesting at/under the depth cap passes; over it throws", () => {
        const wrap = (n: number) => { let s: any = { type: "string" }; for (let i = 0; i < n; i++) s = { type: "array", items: s }; return s; };
        expect(() => parseDataShape(wrap(9), "body")).not.toThrow();   // leaf at depth 9
        expect(() => parseDataShape(wrap(10), "body")).toThrow(/too deep/);
        expect(() => parseDataShape(wrap(50), "body")).toThrow(/too deep/);
    });

    test("a too-wide object (node-count cap) → GatewayValidationError", () => {
        const properties: Record<string, unknown> = {};
        for (let i = 0; i < 600; i++) properties[`f${i}`] = { type: "string" };
        expect(() => parseDataShape({ type: "object", properties } as any, "body")).toThrow(/too many nodes/);
    });

    test("the thrown error carries .status 400", () => {
        try {
            parseDataShape({ type: "datetime" } as any, "body");
            expect.unreachable();
        } catch (err) {
            expect((err as { status?: number }).status).toBe(400);
        }
    });
});
