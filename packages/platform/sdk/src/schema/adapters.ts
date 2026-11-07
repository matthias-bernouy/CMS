import { z } from "zod";
import type { $ZodType } from "zod/v4/core";
import { parseUlviaSchema, validateSchemaValue, SchemaValueError } from "@bernouy/ulvia-contracts/schema";
import type {
    UlviaSchema,
    UlviaStringSchema,
    UlviaBinarySchema,
    UlviaMapSchema,
} from "@bernouy/ulvia-contracts/schema";
import { compileSchema } from "ulvia-sdk/schema/compile";

const registered = new WeakMap<object, UlviaSchema>();

function adapter<Value>(definition: UlviaSchema): z.ZodType<Value, Value> {
    const schema = parseUlviaSchema(definition);
    if ("nullable" in schema && schema.nullable) {
        throw new TypeError("Use .nullable() on the Zod schema instead of constructor metadata");
    }
    const validator = z.custom<Value>((value) => {
        try {
            validateSchemaValue(schema, value);
            return true;
        } catch (error) {
            if (error instanceof SchemaValueError) {
                return false;
            }
            throw error;
        }
    });
    registered.set(validator._zod.def, schema);
    return validator;
}

/** Keeps the v1 UTF-16 and format semantics without changing existing releases. */
export function contractString(definition: Omit<UlviaStringSchema, "type" | "nullable">): z.ZodType<string, string> {
    return adapter<string>({ ...definition, type: "string" });
}

export function contractBinary(
    definition: Omit<UlviaBinarySchema, "type" | "nullable">,
): z.ZodType<Uint8Array, Uint8Array> {
    return adapter<Uint8Array>({ ...definition, type: "binary" });
}

export function contractMap<Value extends z.ZodType>(
    values: Value,
    bounds: Omit<UlviaMapSchema, "type" | "values" | "nullable">,
): z.ZodType<Record<string, z.output<Value>>, Record<string, z.output<Value>>> {
    return adapter<Record<string, z.output<Value>>>({ ...bounds, type: "map", values: compileSchema(values) });
}

export function registeredSchema(schema: $ZodType): UlviaSchema | undefined {
    return registered.get(schema._zod.def);
}
