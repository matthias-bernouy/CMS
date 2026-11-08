import { expect, test } from "bun:test";
import { contractString, contractMap, contractBinary, z } from "@bernouy/ulvia-sdk";
import { compileSchema } from "@bernouy/ulvia-sdk/build";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";

test("bounded map schemas preserve key units, cardinality, nulls and nested value constraints", () => {
    const schema = contractMap(z.strictObject({ count: z.int().min(0).max(2) }), {
        maxProperties: 2,
        minProperties: 1,
        maxKeyLength: 2,
    });
    const compiled = compileSchema(schema.nullable().describe("Counts"));
    expect(compiled).toMatchObject({
        type: "map",
        nullable: true,
        description: "Counts",
        maxKeyLength: 2,
        maxProperties: 2,
    });
    for (const value of [
        null,
        {},
        { a: { count: 1 } },
        { "😀": { count: 2 } },
        { "😀a": { count: 1 } },
        { a: { count: 3 } },
        { a: { count: 1 }, b: { count: 2 }, c: { count: 0 } },
        [],
        { a: { count: 1, extra: true } },
    ]) {
        let accepted = true;
        try {
            validateSchemaValue(compiled, value);
        } catch {
            accepted = false;
        }
        expect(accepted).toBe(schema.nullable().safeParse(value).success);
    }
    expect(() =>
        compileSchema(
            contractMap(
                z.number().refine(() => true),
                { maxProperties: 2, maxKeyLength: 2 },
            ),
        ),
    ).toThrow();
    expect(() => contractMap(z.boolean(), { maxProperties: 257, maxKeyLength: 2 })).toThrow();
});

test("binary schemas preserve byte limits and the resource profile", () => {
    const schema = contractBinary({ maxBytes: 4, resource: true });
    const compiled = compileSchema(schema);
    expect(compiled).toEqual({ type: "binary", maxBytes: 4, resource: true });
    for (const value of [new Uint8Array(), new Uint8Array(4), new Uint8Array(5), [1], "bytes", null]) {
        let accepted = true;
        try {
            validateSchemaValue(compiled, value);
        } catch {
            accepted = false;
        }
        expect(accepted).toBe(schema.safeParse(value).success);
    }
    expect(() => compileSchema(schema.refine(() => true))).toThrow();
    expect(() => contractBinary({ maxBytes: -1 })).toThrow();
});

test("adapter schemas contribute all nested nodes to the compilation budget", () => {
    const shape = z.strictObject(
        Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`f${index}`, z.boolean()])),
    );
    const map = contractMap(shape, { maxProperties: 2, maxKeyLength: 20 });
    const large = z.strictObject(Object.fromEntries(Array.from({ length: 130 }, (_, index) => [`m${index}`, map])));
    expect(() => compileSchema(large)).toThrow("budget");
    expect(() =>
        compileSchema(z.enum(Array.from({ length: 257 }, (_, index) => `e${index}`) as [string, ...string[]])),
    ).toThrow("enum");
    expect(compileSchema(contractString({ maxLength: 20 }).describe("Label"))).toMatchObject({
        maxLength: 20,
        description: "Label",
    });
});
