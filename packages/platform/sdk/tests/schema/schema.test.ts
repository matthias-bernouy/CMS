import { expect, test } from "bun:test";
import { contractString, z } from "@bernouy/ulvia-sdk";
import { compileSchema } from "@bernouy/ulvia-sdk/build";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";

function sameAcceptance(schema: z.ZodType, values: readonly unknown[]): void {
    const compiled = compileSchema(schema);
    for (const value of values) {
        let accepted = true;
        try {
            validateSchemaValue(compiled, value);
        } catch {
            accepted = false;
        }
        expect(accepted, JSON.stringify(value)).toBe(schema.safeParse(value).success);
    }
}

test("strict JSON objects preserve missing properties, nulls, bounds and unknown-key rejection", () => {
    const schema = z.strictObject({
        name: contractString({ minLength: 1, maxLength: 5 }),
        count: z.int().min(0).max(10).optional(),
        active: z.boolean().nullable(),
        tags: z
            .array(z.enum(["red", "blue"]))
            .min(1)
            .max(2),
        note: contractString({ maxLength: 3 }).optional().nullable(),
    });
    const valid = { name: "first", active: null, tags: ["red"] };
    sameAcceptance(schema, [
        valid,
        { ...valid, note: null },
        { ...valid, note: "abc" },
        { ...valid, active: true },
        { ...valid, name: "" },
        { ...valid, name: "longer" },
        { ...valid, count: 1.5 },
        { ...valid, count: -1 },
        { ...valid, count: 11 },
        { ...valid, count: 0 },
        { ...valid, count: 10 },
        { ...valid, count: null },
        { ...valid, tags: [] },
        { ...valid, tags: ["red", "blue", "red"] },
        { ...valid, tags: ["green"] },
        { ...valid, extra: true },
        {},
        null,
    ]);
    expect(compileSchema(schema)).toMatchObject({ type: "object", required: ["name", "active", "tags"] });
});

test("string bounds use Ulvia UTF-16 units, including astral symbols and combining marks", () => {
    sameAcceptance(contractString({ minLength: 1, maxLength: 2 }), ["", "a", "ab", "abc", "😀", "😀a", "e\u0301"]);
    sameAcceptance(contractString({ maxLength: 0 }), ["", "a", "😀", null]);
    expect(z.string().max(1).safeParse("😀").success).toBe(true);
    expect(() => compileSchema(z.string().max(1))).toThrow("UTF-16");
});

test("format schemas use the exact Ulvia validators", () => {
    const cases = {
        email: ["a@b.c", "a@localhost", "a b@c.d", "a@b.c\n"],
        uuid: ["12345678-1234-4234-9234-123456789abc", "12345678-1234-0234-9234-123456789abc"],
        date: ["2024-02-29", "2023-02-29", "2024-01-32"],
        "date-time": ["2024-01-01T00:00:00Z", "2024-01-01T25:00:00Z", "2024-01-01T00:00:00+23:59"],
        uri: ["https://example.com", "urn:example:note", "/relative"],
    } as const;
    for (const [format, values] of Object.entries(cases)) {
        sameAcceptance(contractString({ format: format as keyof typeof cases, maxLength: 200 }), values);
    }
    expect(compileSchema(contractString({ maxLength: 100, sensitive: true, description: "A secret" }))).toMatchObject({
        sensitive: true,
        description: "A secret",
    });
});

test("number primitives preserve finite values, inclusive bounds and safe integer semantics", () => {
    const values = [0, 1, -1, 1.25, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, null, "1"];
    for (const schema of [z.number(), z.number().min(-1).max(1), z.int(), z.number().int(), z.float64()]) {
        sameAcceptance(schema, values);
    }
    expect(compileSchema(z.int()).type).toBe("integer");
    sameAcceptance(z.number().min(-2).min(-1).max(2).max(1), values);
});

test("string enums/literals, nulls and arrays have exact JSON acceptance", () => {
    sameAcceptance(z.enum(["one", "😀"]), ["one", "😀", "two", "", null, 1]);
    sameAcceptance(z.literal(["one", "two"]), ["one", "two", "three", null]);
    sameAcceptance(z.literal(""), ["", "a"]);
    sameAcceptance(z.null(), [null, false, 0, ""]);
    sameAcceptance(z.array(z.boolean()).length(2), [[], [true], [true, false], [true, false, true], [1, 0]]);
    expect(compileSchema(z.array(z.boolean()).min(1).max(3).describe("Flags"))).toMatchObject({
        description: "Flags",
        minItems: 1,
        maxItems: 3,
    });
});
