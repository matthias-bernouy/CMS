import { ReleaseValidationError } from "../protocol/errors";
import { rejectUnknownKeys, type UnknownRecord } from "../protocol/values";
import type { UlviaArraySchema, UlviaBinarySchema, UlviaMapSchema, UlviaSchema } from "../../interfaces/UlviaSchema";
import {
    assertRange,
    parseDescription,
    parseNullable,
    requireBoundedInteger,
    optionalBoundedInteger,
    type SchemaParseState,
} from "./context";

export type NestedSchemaParser = (value: unknown, path: string, state: SchemaParseState, depth: number) => UlviaSchema;

export function parseMapSchema(
    record: UnknownRecord,
    path: string,
    state: SchemaParseState,
    depth: number,
    parseNested: NestedSchemaParser,
): UlviaMapSchema {
    rejectUnknownKeys(
        record,
        ["type", "description", "nullable", "values", "maxKeyLength", "minProperties", "maxProperties"],
        path,
        "invalid_schema",
    );
    const minProperties = optionalBoundedInteger(
        record.minProperties,
        `${path}.minProperties`,
        state.limits.maxProperties,
    );
    const maxProperties = requireBoundedInteger(
        record.maxProperties,
        `${path}.maxProperties`,
        state.limits.maxProperties,
    );
    assertRange(minProperties, maxProperties, path);
    const maxKeyLength = requireBoundedInteger(record.maxKeyLength, `${path}.maxKeyLength`, 256);
    if (maxKeyLength === 0 && (minProperties ?? 0) > 1) {
        throw new ReleaseValidationError("invalid_schema", "zero-length keys permit at most one map entry", path);
    }
    return {
        type: "map",
        values: parseNested(record.values, `${path}.values`, state, depth + 1),
        maxKeyLength,
        maxProperties,
        ...base(record, path),
        ...(minProperties === undefined ? {} : { minProperties }),
    };
}

export function parseArraySchema(
    record: UnknownRecord,
    path: string,
    state: SchemaParseState,
    depth: number,
    parseNested: NestedSchemaParser,
): UlviaArraySchema {
    rejectUnknownKeys(
        record,
        ["type", "description", "nullable", "items", "minItems", "maxItems"],
        path,
        "invalid_schema",
    );
    const minItems = optionalBoundedInteger(record.minItems, `${path}.minItems`, state.limits.maxArrayItems);
    const maxItems = requireBoundedInteger(record.maxItems, `${path}.maxItems`, state.limits.maxArrayItems);
    assertRange(minItems, maxItems, path);
    return {
        type: "array",
        items: parseNested(record.items, `${path}.items`, state, depth + 1),
        maxItems,
        ...base(record, path),
        ...(minItems === undefined ? {} : { minItems }),
    };
}

export function parseBinarySchema(record: UnknownRecord, path: string, state: SchemaParseState): UlviaBinarySchema {
    rejectUnknownKeys(record, ["type", "description", "nullable", "maxBytes"], path, "invalid_schema");
    return {
        type: "binary",
        maxBytes: requireBoundedInteger(record.maxBytes, `${path}.maxBytes`, state.limits.maxBinaryBytes),
        ...base(record, path),
    };
}

function base(record: UnknownRecord, path: string): { description?: string; nullable?: true } {
    const description = parseDescription(record, path);
    return {
        ...(description ? { description } : {}),
        ...(parseNullable(record, path) ? { nullable: true } : {}),
    };
}
