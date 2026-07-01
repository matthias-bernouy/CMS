import { describe, expect, test } from "bun:test";
import type { DataShape } from "@bernouy/cms-sources";
import { flattenDataShape } from "@bernouy/cms-dashboards";

describe("flattenDataShape", () => {
    test("flattens ordered scalar object leaves with required flags", () => {
        const shape: DataShape = {
            type: "object",
            required: ["id", "customer"],
            properties: {
                id: { type: "string" },
                customer: {
                    type: "object",
                    required: ["email"],
                    properties: {
                        name: { type: "string" },
                        email: { type: "string" },
                    },
                },
                total: { type: "number" },
                paid: { type: "boolean" },
            },
        };

        expect(flattenDataShape(shape).map(field => ({
            path: field.path,
            input: field.input,
            required: field.required,
            array: field.array,
        }))).toEqual([
            { path: "id", input: "text", required: true, array: false },
            { path: "customer.name", input: "text", required: false, array: false },
            { path: "customer.email", input: "text", required: true, array: false },
            { path: "total", input: "number", required: false, array: false },
            { path: "paid", input: "boolean", required: false, array: false },
        ]);
    });

    test("unwraps root arrays and marks array fields", () => {
        const shape: DataShape = {
            type: "array",
            items: {
                type: "object",
                required: ["id"],
                properties: {
                    id: { type: "string" },
                    total: { type: "number" },
                },
            },
        };

        expect(flattenDataShape(shape).map(field => ({
            path: field.path,
            required: field.required,
            array: field.array,
        }))).toEqual([
            { path: "id", required: true, array: true },
            { path: "total", required: false, array: true },
        ]);
    });
});
