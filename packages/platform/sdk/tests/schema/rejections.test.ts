import { expect, test } from "bun:test";
import { contractString, SdkDefinitionError, z } from "@bernouy/ulvia-sdk";
import { compileSchema } from "@bernouy/ulvia-sdk/build";

const string = contractString({ maxLength: 20 });
const unsupported: [string, z.ZodType][] = [
    ["unbounded string", z.string()],
    ["native string length", z.string().max(20)],
    ["native email", z.email()],
    ["native uuid", z.uuid()],
    ["stripping object", z.object({})],
    ["loose object", z.looseObject({})],
    ["catchall object", z.strictObject({}).catchall(z.number())],
    ["coercion", z.coerce.number()],
    ["default", z.boolean().default(false)],
    ["prefault", z.boolean().prefault(false)],
    ["catch", z.number().catch(0)],
    ["transform", z.number().transform((value) => String(value))],
    ["refinement", z.number().refine((value) => value > 2)],
    ["async refinement", z.number().refine(async () => true)],
    ["overwrite", z.number().overwrite((value) => value + 1)],
    ["refined contract string", string.refine((value) => value.startsWith("a"))],
    ["union", z.union([z.boolean(), z.number()])],
    ["intersection", z.intersection(z.strictObject({}), z.strictObject({}))],
    ["date", z.date()],
    ["bigint", z.bigint()],
    ["unknown", z.unknown()],
    ["any", z.any()],
    ["optional array item", z.array(z.boolean().optional()).max(2)],
    ["unbounded array", z.array(z.boolean())],
    ["tuple", z.tuple([z.boolean()])],
    ["record", z.record(z.string(), z.boolean())],
    ["numeric literal", z.literal(1)],
    ["boolean literal", z.literal(true)],
    ["exclusive numeric bound", z.number().positive()],
    ["multipleOf", z.number().multipleOf(2)],
    ["narrow numeric format", z.int32()],
    ["lazy", z.lazy(() => z.boolean())],
];

for (const [name, schema] of unsupported) {
    test(`compilation refuses ${name} instead of silently dropping constraints`, () => {
        expect(() => compileSchema(z.strictObject({ value: schema }))).toThrow();
    });
}

test("unsupported nested constraints retain the exact source path", () => {
    try {
        compileSchema(z.strictObject({ items: z.array(z.number().refine(() => true)).max(2) }), "$.capability.input");
        throw new Error("Expected compilation refusal");
    } catch (error) {
        expect(error).toBeInstanceOf(SdkDefinitionError);
        expect((error as SdkDefinitionError).path).toBe('$.capability.input.properties["items"].items');
    }
});

test("conditional built-in checks cannot silently weaken contract validation", () => {
    const schema = z.array(z.boolean()).max(1);
    schema._zod.def.checks![0]!._zod.def.when = () => false;
    expect(() => compileSchema(schema)).toThrow("Unsupported Zod check");
});

test("depth, node, object fanout and declared bounds are bounded during compilation", () => {
    let deep: z.ZodType = z.boolean();
    for (let depth = 0; depth < 30; depth++) {
        deep = z.strictObject({ child: deep });
    }
    expect(() => compileSchema(deep)).toThrow("budget");
    const largeShape = Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`field${i}`, z.boolean()]));
    expect(() => compileSchema(z.strictObject(largeShape))).toThrow("too many");
    const subtree = z.strictObject(
        Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`field${i}`, z.boolean()])),
    );
    const manyNodes = z.strictObject(Object.fromEntries(Array.from({ length: 130 }, (_, i) => [`field${i}`, subtree])));
    expect(() => compileSchema(manyNodes)).toThrow("budget");
    expect(() => compileSchema(z.array(z.boolean()).max(10001))).toThrow();
    expect(() => contractString({ maxLength: 1048577 })).toThrow();
    expect(() => contractString({ minLength: 4, maxLength: 2 })).toThrow();
});

test("an optional root cannot be represented as a JSON contract value", () => {
    expect(() => compileSchema(z.boolean().optional())).toThrow("object properties");
});
