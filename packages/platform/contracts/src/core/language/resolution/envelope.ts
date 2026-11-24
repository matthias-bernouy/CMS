import type { UlviaSchema } from "ulvia-contracts/interfaces/UlviaSchema";
import { validateSchemaValue } from "ulvia-contracts/core/language/schema/validateValue";
import { containsResolvedSchema } from "./traverse";
/** Structural validation only. A resolved field must still be materialized and validated before execution. */
export function validateSchemaEnvelope(schema: UlviaSchema, value: unknown, path = "$"): void {
    if (!containsResolvedSchema(schema)) {
        validateSchemaValue(schema, value, path);
        return;
    }
    validateSchemaValue(placeholderSchema(schema), placeholderValue(schema, value), path);
}
function placeholderSchema(schema: UlviaSchema): UlviaSchema {
    if (schema.type === "resolved") {
        return { type: "null" };
    }
    if (schema.type === "object") {
        return {
            ...schema,
            properties: Object.fromEntries(
                Object.entries(schema.properties).map(([name, child]) => [name, placeholderSchema(child)]),
            ),
        };
    }
    if (schema.type === "array") {
        return { ...schema, items: placeholderSchema(schema.items) };
    }
    if (schema.type === "map") {
        return { ...schema, values: placeholderSchema(schema.values) };
    }
    return schema;
}
function placeholderValue(schema: UlviaSchema, value: unknown): unknown {
    if (schema.type === "resolved") {
        return null;
    }
    if (schema.type === "array" && Array.isArray(value)) {
        return value.map((item) => placeholderValue(schema.items, item));
    }
    if (
        (schema.type === "object" || schema.type === "map") &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    ) {
        return Object.fromEntries(
            Object.entries(value).map(([name, item]) => {
                const child = schema.type === "map" ? schema.values : schema.properties[name];
                return [name, child ? placeholderValue(child, item) : item];
            }),
        );
    }
    return value;
}
