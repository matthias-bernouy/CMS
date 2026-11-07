import type { UlviaSchema } from "../../interfaces/UlviaSchema";
import { SchemaValueError, validateSchemaValue } from "./validateValue";

export function projectSchemaValue(schema: UlviaSchema, value: unknown, path = "$"): unknown {
    const projected = projectValue(schema, value, path);
    validateSchemaValue(schema, projected, path);
    return projected;
}

function projectValue(schema: UlviaSchema, value: unknown, path: string): unknown {
    if (value === null && "nullable" in schema && schema.nullable) {
        return null;
    }
    switch (schema.type) {
        case "array": {
            if (!Array.isArray(value)) {
                throw new SchemaValueError("must be an array", path);
            }
            assertCount(value.length, schema.minItems, schema.maxItems, path);
            const projected: unknown[] = [];
            for (let index = 0; index < value.length; index += 1) {
                if (!Object.hasOwn(value, index)) {
                    throw new SchemaValueError(`is missing array item ${index}`, path);
                }
                projected.push(projectValue(schema.items, value[index], `${path}[${index}]`));
            }
            return projected;
        }
        case "map": {
            const record = asRecord(value, path);
            assertMapCount(record, schema.minProperties, schema.maxProperties, path);
            const projected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
            for (const [key, item] of Object.entries(record)) {
                projected[key] = projectValue(schema.values, item, `${path}.${key}`);
            }
            return projected;
        }
        case "object": {
            const record = asRecord(value, path);
            const projected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
            for (const [name, property] of Object.entries(schema.properties)) {
                if (Object.hasOwn(record, name)) {
                    projected[name] = projectValue(property, record[name], `${path}.${name}`);
                }
            }
            return projected;
        }
        default:
            return value;
    }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Uint8Array) {
        throw new SchemaValueError("must be an object", path);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new SchemaValueError("must be a plain object", path);
    }
    return value as Record<string, unknown>;
}

function assertMapCount(
    value: Readonly<Record<string, unknown>>,
    minimum: number | undefined,
    maximum: number,
    path: string,
): void {
    let count = 0;
    for (const key in value) {
        if (Object.hasOwn(value, key)) {
            count += 1;
            if (count > maximum) {
                throw new SchemaValueError(`entry count must be between ${minimum ?? 0} and ${maximum}`, path);
            }
        }
    }
    assertCount(count, minimum, maximum, path);
}

function assertCount(count: number, minimum: number | undefined, maximum: number, path: string): void {
    if (count < (minimum ?? 0) || count > maximum) {
        throw new SchemaValueError(`entry count must be between ${minimum ?? 0} and ${maximum}`, path);
    }
}
