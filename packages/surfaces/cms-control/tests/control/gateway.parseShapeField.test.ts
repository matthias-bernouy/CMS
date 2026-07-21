import { describe, test, expect } from "bun:test";
import type { DataShape } from "@bernouy/cms-sources";
import { makeNode } from "cms-control/components/admin/EndpointsInput/bodyNode";
import { makeResponseRow } from "cms-control/components/admin/EndpointsInput/responseRow";
import { parseShapeField } from "cms-control/core/validation/gateway/parseShapeField";

describe("parseShapeField", () => {
    test("blank / null → undefined (no shape)", () => {
        expect(parseShapeField("", "body")).toBeUndefined();
        expect(parseShapeField(null, "body")).toBeUndefined();
        expect(parseShapeField(undefined, "body")).toBeUndefined();
    });

    test("valid JSON string → DataShape", () => {
        expect(
            parseShapeField(JSON.stringify({ type: "object", properties: { a: { type: "string" } } }), "body"),
        ).toEqual({ type: "object", properties: { a: { type: "string" } } });
    });

    test("malformed JSON → InvalidParam", () => {
        expect(() => parseShapeField("{not json", "body")).toThrow(/body/);
    });

    test("non-string value → InvalidParam", () => {
        expect(() => parseShapeField({ type: "string" } as any, "body")).toThrow(/body/);
    });

    test("shape rules are delegated to the gateway (SourceValidationError, .status 400)", () => {
        try {
            parseShapeField(JSON.stringify({ type: "datetime" }), "body");
            expect.unreachable();
        } catch (err) {
            expect((err as Error).name).toBe("SourceValidationError");
            expect((err as { status?: number }).status).toBe(400);
        }
    });
});

describe("endpoint DataShape editor", () => {
    test("preserves nullable modifiers while reconstructing a seeded shape", () => {
        const shape: DataShape = {
            type: "object",
            nullable: true,
            properties: {
                email: { type: "string", nullable: true },
                rows: {
                    type: "array",
                    items: { type: "number", nullable: true },
                },
            },
        };

        expect(makeNode(shape, () => undefined).read()).toEqual(shape);
    });

    test("preserves server-only trigger fields while editing the public response", () => {
        const triggerBody: DataShape = {
            type: "object",
            properties: { authorization: { type: "string" } },
            required: ["authorization"],
        };
        const row = makeResponseRow(
            {
                status: "201",
                body: { type: "object", properties: { id: { type: "number" } } },
                triggerBody,
            },
            () => undefined,
            () => undefined,
        );

        expect(row.read()).toEqual({
            status: "201",
            body: { type: "object", properties: { id: { type: "number" } } },
            triggerBody,
        });
    });
});
