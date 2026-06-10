import { describe, test, expect } from "bun:test";
import { parseShapeField } from "cms-control/core/validation/gateway/parseShapeField";

describe("parseShapeField", () => {
    test("blank / null → undefined (no shape)", () => {
        expect(parseShapeField("", "body")).toBeUndefined();
        expect(parseShapeField(null, "body")).toBeUndefined();
        expect(parseShapeField(undefined, "body")).toBeUndefined();
    });

    test("valid JSON string → DataShape", () => {
        expect(parseShapeField(JSON.stringify({ type: "object", properties: { a: { type: "string" } } }), "body"))
            .toEqual({ type: "object", properties: { a: { type: "string" } } });
    });

    test("malformed JSON → InvalidParam", () => {
        expect(() => parseShapeField("{not json", "body")).toThrow(/body/);
    });

    test("non-string value → InvalidParam", () => {
        expect(() => parseShapeField({ type: "string" } as any, "body")).toThrow(/body/);
    });

    test("shape rules are delegated to the gateway (GatewayValidationError, .status 400)", () => {
        try {
            parseShapeField(JSON.stringify({ type: "datetime" }), "body");
            expect.unreachable();
        } catch (err) {
            expect((err as Error).name).toBe("GatewayValidationError");
            expect((err as { status?: number }).status).toBe(400);
        }
    });
});
