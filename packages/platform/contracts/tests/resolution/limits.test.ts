import { expect, test } from "bun:test";
import { resolveSchema, parseSchemaDescriptor, schemaDescriptorWire } from "@bernouy/ulvia-contracts/resolution";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import { node, schema, descriptor, release } from "./fixture";
test("identical slots resolve once and homogeneous arrays retain their root selector and slot path", async () => {
    let calls = 0;
    const dynamic = {
        ...schema,
        properties: { ...schema.properties, repeated: node, rows: { type: "array", maxItems: 2, items: node } },
        required: [...schema.required, "repeated", "rows"],
    } as const;
    const value = {
        formId: "contact",
        formVersion: 2,
        answers: { email: "a" },
        repeated: { email: "b" },
        rows: [{ email: "c" }],
    };
    const result = await resolveSchema(dynamic, value, {
        capabilities: release().capabilities,
        invoke: async () => {
            calls++;
            return descriptor;
        },
        seal: async () => undefined,
    });
    expect(calls).toBe(1);
    expect(result.bindings.map(({ path }) => path)).toEqual(["/answers", "/repeated", "/rows/*"]);
    validateSchemaValue(result.schema, value);
    expect(() => validateSchemaValue(result.schema, { ...value, rows: [{ email: 3 }] })).toThrow();
});
test("native schema depth remains available in descriptors while slot counts are bounded before queries", async () => {
    let concrete: UlviaSchema = { type: "boolean" };
    for (let index = 0; index < 20; index++) {
        concrete = { type: "object", properties: { nested: concrete }, required: ["nested"] };
    }
    const wire = schemaDescriptorWire({ resourceId: "deep", version: "1", schema: concrete, fields: [] });
    expect(parseSchemaDescriptor(wire).schema).toEqual(concrete);
    let calls = 0;
    const oversized: UlviaSchema = {
        type: "object",
        properties: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`field${index}`, node])),
        required: [],
    };
    await expect(
        resolveSchema(
            oversized,
            {},
            {
                capabilities: release().capabilities,
                invoke: async () => {
                    calls++;
                    return descriptor;
                },
                seal: async () => undefined,
            },
        ),
    ).rejects.toHaveProperty("code", "SCHEMA_RESOLUTION_LIMIT");
    expect(calls).toBe(0);
});
