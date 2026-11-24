import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";

/** A separate schema describes the projected payload; removed leaves are never fake replacement values. */
export function eventProjectionSchema(schema: UlviaSchema): UlviaSchema | undefined {
    if (schema.type === "binary" || (schema.type === "string" && schema.sensitive)) {
        return undefined;
    }
    if (schema.type === "object") {
        const properties: Record<string, UlviaSchema> = Object.create(null);
        for (const [name, child] of Object.entries(schema.properties)) {
            const projected = eventProjectionSchema(child);
            if (projected) {
                properties[name] = projected;
            }
        }
        return {
            type: "object",
            ...(schema.nullable ? { nullable: true } : {}),
            properties,
            required: schema.required.filter((name) => Object.hasOwn(properties, name)),
        };
    }
    if (schema.type === "array") {
        const items = eventProjectionSchema(schema.items);
        return items ? { ...schema, items } : undefined;
    }
    if (schema.type === "map") {
        const values = eventProjectionSchema(schema.values);
        return values ? { ...schema, values } : undefined;
    }
    return { ...schema };
}

function project(schema: UlviaSchema, value: unknown): unknown {
    if (value === null) {
        return null;
    }
    if (schema.type === "object") {
        const record = value as Record<string, unknown>;
        const result: Record<string, unknown> = Object.create(null);
        for (const [name, child] of Object.entries(schema.properties)) {
            if (Object.hasOwn(record, name)) {
                result[name] = project(child, record[name]);
            }
        }
        return result;
    }
    if (schema.type === "array") {
        return (value as unknown[]).map((item) => project(schema.items, item));
    }
    if (schema.type === "map") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, project(schema.values, item)]),
        );
    }
    return value;
}

export function projectEventValue(schema: UlviaSchema, value: unknown): unknown {
    const projection = eventProjectionSchema(schema);
    if (!projection) {
        return undefined;
    }
    const result = project(projection, value);
    validateSchemaValue(projection, result);
    return result;
}
