import { expect, test } from "bun:test";
import {
    validatedMapEntries,
    validateSchemaValue,
    parseUlviaSchema,
    SchemaValueError,
} from "@bernouy/ulvia-contracts/schema";
const bounds = { maxKeyLength: 2, maxProperties: 2, minProperties: 1 };
test("shared map traversal enforces plain own records, counts and UTF-16 key lengths", () => {
    expect([...validatedMapEntries(bounds, { "😀": true })]).toEqual([["😀", true]]);
    for (const value of [
        null,
        [],
        new Uint8Array(1),
        Object.create({ a: true }),
        {},
        { a: true, b: true, c: true },
        { "😀a": true },
    ]) {
        expect(() => [...validatedMapEntries(bounds, value)]).toThrow(SchemaValueError);
    }
    const value = Object.assign(Object.create(null), { a: true });
    expect([...validatedMapEntries(bounds, value)]).toEqual([["a", true]]);
});
test("wire map validation preserves the original first-error traversal order", () => {
    const schema = parseUlviaSchema({ ...bounds, type: "map", values: { type: "boolean" } });
    try {
        validateSchemaValue(schema, { a: 42, "long": true });
        throw new Error("Expected refusal");
    } catch (error) {
        expect(error).toMatchObject({ path: "$.a" });
    }
});
