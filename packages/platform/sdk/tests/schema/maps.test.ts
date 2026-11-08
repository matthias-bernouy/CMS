import { expect, test } from "bun:test";
import { contractMap, contractString, z } from "@bernouy/ulvia-sdk";
import { compileSchema } from "@bernouy/ulvia-sdk/build";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";

test("map definition captures child identity and bounds without reading or converting the child Zod model", () => {
    let reads = 0;
    const child = new Proxy(z.boolean(), {
        get(target, key, receiver) {
            if (key === "_zod") {
                reads++;
            }
            return Reflect.get(target, key, receiver);
        },
    });
    const bounds = { maxKeyLength: 2, maxProperties: 1 };
    const map = contractMap(child, bounds);
    expect(reads).toBe(0);
    bounds.maxKeyLength = 20;
    bounds.maxProperties = 20;
    expect(compileSchema(map)).toEqual({ type: "map", values: { type: "boolean" }, maxKeyLength: 2, maxProperties: 1 });
    expect(reads).toBeGreaterThan(0);
    expect(map.safeParse({ "😀": true }).success).toBe(true);
    expect(map.safeParse({ "😀x": true }).success).toBe(false);
    expect(map.safeParse({ a: true, b: false }).success).toBe(false);
});
test("map values share the outer schema's depth/node budget and report unsupported child constraints at build time", () => {
    let value: z.ZodType = z.boolean();
    for (let depth = 0; depth < 30; depth++) {
        value = contractMap(value, { maxKeyLength: 2, maxProperties: 1 });
    }
    expect(() => compileSchema(value)).toThrow("budget");
    for (const child of [z.boolean().optional(), z.number().transform(String), z.number().refine(() => true)]) {
        const map = contractMap(child, { maxKeyLength: 2, maxProperties: 1 });
        try {
            compileSchema(map, "$.input");
            throw new Error("Expected refusal");
        } catch (error) {
            expect(error).toMatchObject({ path: "$.input.values" });
        }
    }
});
test("map Zod and wire validators agree for own special keys, null prototypes, invalid prototypes and nested values", () => {
    const model = contractMap(z.strictObject({ name: contractString({ maxLength: 2 }) }).readonly(), {
        maxProperties: 2,
        maxKeyLength: 20,
    });
    const compiled = compileSchema(model);
    const nullPrototype = Object.assign(Object.create(null), { a: { name: "😀" } });
    class Invalid {
        a = { name: "ok" };
    }
    for (const value of [
        nullPrototype,
        JSON.parse('{"__proto__":{"name":"ok"}}'),
        { constructor: { name: "ok" } },
        Object.create({ a: { name: "ok" } }),
        new Invalid(),
        new Date(),
        new Uint8Array(1),
        [],
        null,
        { a: { name: "long" } },
        { a: { name: "ok", extra: true } },
    ]) {
        let accepted = true;
        try {
            validateSchemaValue(compiled, value);
        } catch {
            accepted = false;
        }
        expect(model.safeParse(value).success).toBe(accepted);
    }
});
