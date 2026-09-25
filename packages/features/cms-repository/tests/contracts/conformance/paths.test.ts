import { describe, expect, test } from "bun:test";
import { resolveConformancePath } from "cms-repository/contracts/core/conformance/calls/paths";
import type { UlviaObjectSchema } from "@bernouy/cms-repository/contracts/schema";

const schema: UlviaObjectSchema = {
    type: "object",
    required: ["items", "metadata"],
    properties: {
        items: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: { type: "object", required: ["id"], properties: { id: { type: "string", maxLength: 20 } } },
        },
        metadata: { type: "map", maxKeyLength: 30, maxProperties: 3, values: { type: "string", maxLength: 20 } },
    },
};

describe("conformance output paths", () => {
    test("selects guaranteed array items and decodes arbitrary map keys exactly once", () => {
        expect(resolveConformancePath(schema, "/items/0/id", "$", true).type).toBe("string");
        expect(resolveConformancePath(schema, "/metadata/key~1with~0escape", "$").type).toBe("string");
        expect(resolveConformancePath(schema, "/metadata/", "$").type).toBe("string");
    });

    test("keeps dynamic keys and non-guaranteed indices out of unconditional captures", () => {
        expect(() => resolveConformancePath(schema, "/items/1/id", "$", true)).toThrow("guaranteed");
        expect(() => resolveConformancePath(schema, "/metadata/key", "$", true)).toThrow("presence assertion");
        expect(() => resolveConformancePath(schema, "/items/2/id", "$")).toThrow("bounds");
        expect(() => resolveConformancePath(schema, "/items/01/id", "$")).toThrow("canonical index");
        expect(() => resolveConformancePath(schema, "/metadata/key~2", "$")).toThrow("Pointer escape");
    });
});
