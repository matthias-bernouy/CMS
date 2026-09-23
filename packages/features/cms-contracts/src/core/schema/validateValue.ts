import type { UlviaSchema } from "../../interfaces/UlviaSchema";
import { matchesStringFormat } from "./formats";

export class SchemaValueError extends TypeError {
    readonly path: string;

    constructor(message: string, path = "$") {
        super(`${path}: ${message}`);
        this.name = "SchemaValueError";
        this.path = path;
    }
}

export function validateSchemaValue(schema: UlviaSchema, value: unknown, path = "$"): void {
    if (value === null && "nullable" in schema && schema.nullable) {
        return;
    }
    switch (schema.type) {
        case "array": {
            if (!Array.isArray(value)) {
                fail("must be an array", path);
            }
            assertCount(value.length, schema.minItems, schema.maxItems, path);
            for (let index = 0; index < value.length; index += 1) {
                if (!Object.hasOwn(value, index)) {
                    fail(`is missing array item ${index}`, path);
                }
                validateSchemaValue(schema.items, value[index], `${path}[${index}]`);
            }
            return;
        }
        case "binary":
            if (!(value instanceof Uint8Array)) {
                fail("must be a Uint8Array", path);
            }
            if (value.byteLength > schema.maxBytes) {
                fail(`must not exceed ${schema.maxBytes} bytes`, path);
            }
            return;
        case "boolean":
            if (typeof value !== "boolean") {
                fail("must be a boolean", path);
            }
            return;
        case "integer":
        case "number":
            validateNumber(schema, value, path);
            return;
        case "map": {
            const record = asRecord(value, path);
            const entries = Object.entries(record);
            assertCount(entries.length, schema.minProperties, schema.maxProperties, path);
            for (const [key, item] of entries) {
                if (key.length > schema.maxKeyLength) {
                    fail(`key ${JSON.stringify(key)} exceeds ${schema.maxKeyLength} characters`, path);
                }
                validateSchemaValue(schema.values, item, `${path}.${key}`);
            }
            return;
        }
        case "null":
            if (value !== null) {
                fail("must be null", path);
            }
            return;
        case "object":
            validateObject(schema, value, path);
            return;
        case "string":
            validateString(schema, value, path);
            return;
    }
}

function validateObject(schema: Extract<UlviaSchema, { type: "object" }>, value: unknown, path: string): void {
    const record = asRecord(value, path);
    const keys = Object.keys(record);
    assertCount(keys.length, schema.minProperties, schema.maxProperties ?? Object.keys(schema.properties).length, path);
    for (const name of schema.required) {
        if (!Object.hasOwn(record, name)) {
            fail(`missing required property ${JSON.stringify(name)}`, path);
        }
    }
    for (const [name, item] of Object.entries(record)) {
        if (!Object.hasOwn(schema.properties, name)) {
            fail(`contains undeclared property ${JSON.stringify(name)}`, path);
        }
        const property = schema.properties[name]!;
        validateSchemaValue(property, item, `${path}.${name}`);
    }
}

function validateString(schema: Extract<UlviaSchema, { type: "string" }>, value: unknown, path: string): void {
    if (typeof value !== "string") {
        fail("must be a string", path);
    }
    if (value.length < (schema.minLength ?? 0) || value.length > schema.maxLength) {
        fail(`length must be between ${schema.minLength ?? 0} and ${schema.maxLength}`, path);
    }
    if (schema.enum && !schema.enum.includes(value)) {
        fail("must be one of the declared enum values", path);
    }
    if (schema.format && !matchesStringFormat(value, schema.format)) {
        fail(`must match format ${schema.format}`, path);
    }
}

function validateNumber(
    schema: Extract<UlviaSchema, { type: "integer" | "number" }>,
    value: unknown,
    path: string,
): void {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        fail("must be a finite number", path);
    }
    if (schema.type === "integer" && !Number.isSafeInteger(value)) {
        fail("must be a safe integer", path);
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
        fail(`must be at least ${schema.minimum}`, path);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
        fail(`must be at most ${schema.maximum}`, path);
    }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Uint8Array) {
        fail("must be an object", path);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        fail("must be a plain object", path);
    }
    return value as Record<string, unknown>;
}

function assertCount(count: number, minimum: number | undefined, maximum: number, path: string): void {
    if (count < (minimum ?? 0) || count > maximum) {
        fail(`entry count must be between ${minimum ?? 0} and ${maximum}`, path);
    }
}

function fail(message: string, path: string): never {
    throw new SchemaValueError(message, path);
}
