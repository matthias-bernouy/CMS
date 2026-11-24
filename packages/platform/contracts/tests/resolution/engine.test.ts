import { expect, test } from "bun:test";
import { parseContractRelease } from "@bernouy/ulvia-contracts";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import { parseUlviaSchema, validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { resolveSchema, parseSchemaDescriptor, validateSchemaEnvelope } from "@bernouy/ulvia-contracts/resolution";
import { contractDocument } from "../support/fixtures";
import { string, node, schema, descriptor, resolver, release } from "./fixture";

test("resolved fields use the native grammar, require declared query roles and fail closed without resolution", () => {
    expect(release().events![0]!.schema).toEqual(schema);
    expect(() => validateSchemaValue(schema, { formId: "contact", formVersion: 2, answers: {} })).toThrow();
    for (const invalid of [
        { ...node, arbitrary: true },
        { ...node, selector: {} },
        { ...node, selector: { formId: { source: "value", path: "/bad~2" } } },
    ]) {
        expect(() => parseUlviaSchema(invalid)).toThrow();
    }
    expect(() =>
        parseContractRelease(
            contractDocument({ capabilities: [{ ...resolver, schemaResolver: undefined }], events: release().events }),
        ),
    ).toThrow();
    const missing = { ...schema, properties: { ...schema.properties, formId: { ...string, nullable: true } } };
    expect(() =>
        parseContractRelease(
            contractDocument({
                capabilities: [resolver],
                events: [{ id: "submitted", sensitive: false, schema: missing }],
            }),
        ),
    ).toThrow();
});

test("resolution validates selector, descriptor, pinned version and final data before acceptance", async () => {
    const capabilities = release().capabilities;
    let calls = 0;
    let seals = 0;
    const options = {
        capabilities,
        invoke: async (_resolver: unknown, input: unknown) => {
            calls++;
            expect(input).toEqual({ selectorJson: '{"formId":"contact"}', version: "2" });
            return descriptor;
        },
        seal: async () => {
            seals++;
        },
    };
    const value = { formId: "contact", formVersion: 2, answers: { email: "a@example.test" } };
    validateSchemaEnvelope(schema, value);
    const result = await resolveSchema(schema, value, options);
    expect(result.bindings[0]?.path).toBe("/answers");
    validateSchemaValue(result.schema, value);
    expect(calls).toBe(1);
    expect(seals).toBe(1);
    expect(() => validateSchemaValue(result.schema, { ...value, answers: { email: 3 } })).toThrow();
    await expect(resolveSchema(schema, { ...value, formId: 3 }, options)).rejects.toMatchObject({
        code: "INVALID_SELECTOR",
    });
    await expect(
        resolveSchema(schema, { ...value, formVersion: 3 }, { ...options, invoke: async () => descriptor }),
    ).rejects.toMatchObject({ code: "SCHEMA_VERSION_CONFLICT" });
    await expect(
        resolveSchema(schema, value, { ...options, invoke: async () => ({ ...descriptor, digest: "a".repeat(71) }) }),
    ).rejects.toMatchObject({ code: "INVALID_SCHEMA_DESCRIPTOR" });
    expect(() => validateSchemaEnvelope(schema, { ...value, extra: true })).toThrow();
});

test("capability output selectors can reference original input without assuming unresolved values are typed", async () => {
    const output: UlviaSchema = {
        type: "object",
        properties: {
            answers: { ...node, version: undefined, selector: { formId: { source: "input", path: "/formId" } } },
        },
        required: ["answers"],
    };
    const result = await resolveSchema(
        output,
        { answers: {} },
        {
            capabilities: release().capabilities,
            input: { formId: "contact" },
            invoke: async () => descriptor,
            seal: async () => undefined,
        },
    );
    expect(() => validateSchemaValue(result.schema, { answers: {} })).toThrow();
    await expect(
        resolveSchema(
            output,
            { answers: {} },
            { capabilities: release().capabilities, invoke: async () => descriptor, seal: async () => undefined },
        ),
    ).rejects.toMatchObject({ code: "INVALID_SELECTOR" });
});

test("descriptors reject nested resolvers and cannot lie about their native schema or field identities", () => {
    for (const invalid of [
        { ...descriptor, schemaJson: "null" },
        { ...descriptor, schemaJson: JSON.stringify(node) },
        { ...descriptor, fields: [{ id: "missing", property: "missing", label: "Missing", sensitive: false }] },
    ]) {
        expect(() => parseSchemaDescriptor(invalid)).toThrow();
    }
});
