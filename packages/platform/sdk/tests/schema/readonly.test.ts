import { expect, test } from "bun:test";
import { contractString, z } from "@bernouy/ulvia-sdk";
import { compileSchema } from "@bernouy/ulvia-sdk/build";

test("readonly wrappers preserve array/object acceptance, required fields and emitted schema bytes", () => {
    const list = z.array(z.strictObject({ id: contractString({ maxLength: 128 }) })).max(100);
    expect(compileSchema(list.readonly())).toEqual(compileSchema(list));
    const object = z.strictObject({
        items: list.readonly(),
        optional: list.readonly().optional(),
        nullable: list.readonly().nullable(),
    });
    expect(compileSchema(object.readonly())).toEqual(compileSchema(object));
    expect(object.safeParse({ items: [], nullable: null }).success).toBe(true);
    expect(object.safeParse({ items: [], nullable: null, extra: true }).success).toBe(false);
    expect(object.safeParse({ nullable: null }).success).toBe(false);
});

test("literal enum adapters retain their explicit v1 bounds and exact values", () => {
    const permission = contractString({ enum: ["read", "write"], maxLength: 32 });
    expect(compileSchema(permission)).toEqual({ type: "string", enum: ["read", "write"], maxLength: 32 });
    expect(permission.parse("read")).toBe("read");
    expect(permission.safeParse("unknown").success).toBe(false);
});
