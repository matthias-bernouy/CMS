import { ReleaseValidationError } from "../protocol/errors";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import { deepFreeze, expectRecord, expectString } from "../protocol/values";
import type { UlviaSchema } from "../../interfaces/UlviaSchema";
import { createSchemaState, enterSchema, type SchemaParseState } from "./context";
import { parseArraySchema, parseBinarySchema, parseMapSchema } from "./parseContainers";
import { parseObjectSchema } from "./parseObject";
import { parseBooleanSchema, parseNullSchema, parseNumberSchema, parseStringSchema } from "./parseScalars";

export function parseUlviaSchema(
    value: unknown,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): UlviaSchema {
    return deepFreeze(parseSchemaAt(value, "$", createSchemaState(limits), 1)) as UlviaSchema;
}

export function parseSchemaAt(value: unknown, path: string, state: SchemaParseState, depth: number): UlviaSchema {
    enterSchema(state, path, depth);
    const record = expectRecord(value, path, "invalid_schema");
    const type = expectString(record.type, `${path}.type`, "invalid_schema", 16);
    switch (type) {
        case "array":
            return parseArraySchema(record, path, state, depth, parseSchemaAt);
        case "binary":
            return parseBinarySchema(record, path, state);
        case "boolean":
            return parseBooleanSchema(record, path);
        case "integer":
        case "number":
            return parseNumberSchema(record, path);
        case "map":
            return parseMapSchema(record, path, state, depth, parseSchemaAt);
        case "null":
            return parseNullSchema(record, path);
        case "object":
            return parseObjectSchema(record, path, state, depth, parseSchemaAt);
        case "string":
            return parseStringSchema(record, path, state);
        default:
            throw new ReleaseValidationError(
                "invalid_schema",
                `unsupported schema type ${JSON.stringify(type)}`,
                `${path}.type`,
            );
    }
}
