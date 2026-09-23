import { ReleaseValidationError } from "../protocol/errors";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import { expectBoolean, expectSafeInteger, expectString, type UnknownRecord } from "../protocol/values";

export interface SchemaParseState {
    readonly limits: Readonly<ReleaseLimits>;
    nodes: number;
}

export const DESCRIPTION_MAX_LENGTH = 4096;
export const PROPERTY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
export const MEDIA_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

export function createSchemaState(limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS): SchemaParseState {
    return { limits, nodes: 0 };
}

export function enterSchema(state: SchemaParseState, path: string, depth: number): void {
    if (depth > state.limits.maxSchemaDepth) {
        throw new ReleaseValidationError("invalid_schema", `exceeds schema depth ${state.limits.maxSchemaDepth}`, path);
    }
    state.nodes += 1;
    if (state.nodes > state.limits.maxSchemaNodes) {
        throw new ReleaseValidationError(
            "invalid_schema",
            `release exceeds ${state.limits.maxSchemaNodes} schema nodes`,
            path,
        );
    }
}

export function parseDescription(record: UnknownRecord, path: string): string | undefined {
    return record.description === undefined
        ? undefined
        : expectString(record.description, `${path}.description`, "invalid_schema", DESCRIPTION_MAX_LENGTH);
}

export function parseNullable(record: UnknownRecord, path: string): true | undefined {
    if (record.nullable === undefined) {
        return undefined;
    }
    if (!expectBoolean(record.nullable, `${path}.nullable`, "invalid_schema")) {
        throw new ReleaseValidationError("invalid_schema", "must be true when present", `${path}.nullable`);
    }
    return true;
}

export function optionalBoundedInteger(value: unknown, path: string, maximum: number): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = expectSafeInteger(value, path, "invalid_schema");
    if (parsed < 0 || parsed > maximum) {
        throw new ReleaseValidationError("invalid_schema", `must be between 0 and ${maximum}`, path);
    }
    return parsed;
}

export function requireBoundedInteger(value: unknown, path: string, maximum: number): number {
    const parsed = optionalBoundedInteger(value, path, maximum);
    if (parsed === undefined) {
        throw new ReleaseValidationError("invalid_schema", "is required", path);
    }
    return parsed;
}

export function assertRange(minimum: number | undefined, maximum: number | undefined, path: string): void {
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        throw new ReleaseValidationError("invalid_schema", "minimum must not exceed maximum", path);
    }
}
