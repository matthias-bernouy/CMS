import { z } from "zod";
import type { $ZodType } from "zod/v4/core";
import {
    parseUlviaSchema,
    validateSchemaValue,
    validatedMapEntries,
    SchemaValueError,
} from "@bernouy/ulvia-contracts/schema";
import type {
    UlviaSchema,
    UlviaStringSchema,
    UlviaBinarySchema,
    UlviaMapSchema,
} from "@bernouy/ulvia-contracts/schema";

type RegisteredSchema =
    | { readonly kind: "wire"; readonly schema: UlviaSchema }
    | { readonly kind: "map"; readonly schema: UlviaMapSchema; readonly values: z.ZodType };
const registered = new WeakMap<object, RegisteredSchema>();

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
    registered.set(validator._zod.def, { kind: "wire", schema });
    return validator;
}

/** Keeps the v1 UTF-16 and format semantics without changing existing releases. */
type StringValue<Definition> = Definition extends { readonly enum: readonly (infer Value extends string)[] }
    ? Value
    : string;

export function contractString<const Definition extends Omit<UlviaStringSchema, "type" | "nullable">>(
    definition: Definition,
): z.ZodType<StringValue<Definition>, StringValue<Definition>> {
    return adapter<StringValue<Definition>>({ ...definition, type: "string" });
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
    // Validate/snapshot only the wire bounds here; Zod value conversion belongs exclusively to compilation.
    const schema = parseUlviaSchema({ ...bounds, type: "map", values: { type: "null" } });
    if (schema.type !== "map" || schema.nullable) {
        throw new TypeError("Use .nullable() on the Zod schema instead of constructor metadata");
    }
    const validator = z.custom<Record<string, z.output<Value>>>((value) => {
        try {
            for (const [, item] of validatedMapEntries(schema, value)) {
                if (!values.safeParse(item).success) {
                    return false;
                }
            }
            return true;
        } catch (error) {
            if (error instanceof SchemaValueError) {
                return false;
            }
            throw error;
        }
    });
    registered.set(validator._zod.def, { kind: "map", schema, values });
    return validator;
}

export function registeredSchema(schema: $ZodType): RegisteredSchema | undefined {
    return registered.get(schema._zod.def);
}
