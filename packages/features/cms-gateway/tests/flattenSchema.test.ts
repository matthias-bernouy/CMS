import { describe, expect, test } from "bun:test";
import { flattenSchema } from "@bernouy/cms-gateway";

describe("flattenSchema", () => {
    test("returns empty for an empty/undefined schema", () => {
        expect(flattenSchema(undefined)).toEqual([]);
        expect(flattenSchema({})).toEqual([]);
    });

    test("emits leaf paths for a flat object", () => {
        const fields = flattenSchema({
            type: "object",
            properties: {
                id:   { type: "string" },
                name: { type: "string" },
            },
        });
        expect(fields.sort()).toEqual(["id", "name"]);
    });

    test("recurses into nested objects with dotted paths", () => {
        const fields = flattenSchema({
            type: "object",
            properties: {
                user: {
                    type: "object",
                    properties: {
                        firstname: { type: "string" },
                        address: {
                            type: "object",
                            properties: { city: { type: "string" } },
                        },
                    },
                },
            },
        });
        expect(fields.sort()).toEqual(["user.address.city", "user.firstname"]);
    });

    test("uses [] notation for arrays", () => {
        const fields = flattenSchema({
            type: "array",
            items: {
                type: "object",
                properties: { id: { type: "string" }, title: { type: "string" } },
            },
        });
        expect(fields.sort()).toEqual(["[].id", "[].title"]);
    });

    test("nested arrays are layered", () => {
        const fields = flattenSchema({
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: { id: { type: "string" } },
                    },
                },
            },
        });
        expect(fields).toEqual(["items[].id"]);
    });

    test("falls back to a primitive marker when array items are scalar", () => {
        const fields = flattenSchema({ type: "array", items: { type: "string" } });
        expect(fields).toEqual(["[]"]);
    });
});
