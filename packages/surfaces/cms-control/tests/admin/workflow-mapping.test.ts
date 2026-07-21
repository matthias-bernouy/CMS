import { describe, expect, test } from "bun:test";
import {
    mappedObject,
    referencesFromShape,
    targetsFromShape,
} from "cms-control/components/admin/Resources/WorkflowEditor/mapping";

describe("workflow mapping editor", () => {
    test("derives selectable references from nested response contracts", () => {
        expect(
            referencesFromShape(
                {
                    type: "object",
                    properties: {
                        order: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                total: { type: "number" },
                            },
                        },
                    },
                },
                "$response.body",
                "Response body",
            ),
        ).toEqual([
            expect.objectContaining({ value: "$response.body" }),
            expect.objectContaining({ value: "$response.body.order" }),
            expect.objectContaining({ value: "$response.body.order.id", shape: { type: "string" } }),
            expect.objectContaining({ value: "$response.body.order.total", shape: { type: "number" } }),
        ]);
    });

    test("derives target fields and preserves nested request mappings", () => {
        const targets = targetsFromShape({
            type: "object",
            properties: {
                order: {
                    type: "object",
                    properties: { id: { type: "string" } },
                    required: ["id"],
                },
                notify: { type: "boolean" },
            },
            required: ["order"],
        });

        expect(targets).toEqual([
            expect.objectContaining({ path: "order.id", required: true }),
            expect.objectContaining({ path: "notify", shape: { type: "boolean" } }),
        ]);
        expect(
            mappedObject({
                "order.id": { mode: "reference", value: "$response.body.order.id" },
                notify: { mode: "literal", value: "true" },
            }),
        ).toEqual({
            order: { id: "$response.body.order.id" },
            notify: true,
        });
    });
});
