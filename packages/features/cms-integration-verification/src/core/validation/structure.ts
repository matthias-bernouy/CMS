import { assertIJsonValue, InvalidIJsonValueError } from "@bernouy/cms-integration-packages";
import { IntegrationVerificationContractError } from "./errors";

export const MAX_CONTRACT_COLLECTION_ENTRIES = 4_096;

export function assertContractIJson(value: unknown): void {
    try {
        assertIJsonValue(value);
    } catch (error) {
        if (error instanceof InvalidIJsonValueError) {
            throw new IntegrationVerificationContractError("invalid_contract", error.message);
        }
        throw error;
    }
}

export function strictRecord(value: unknown, field: string, allowedFields: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw invalid(field, "must be an object");
    }
    const record = value as Record<string, unknown>;
    const allowed = new Set(allowedFields);
    const unknownField = Object.keys(record).find((key) => !allowed.has(key));
    if (unknownField) {
        throw invalid(`${field}.${unknownField}`, "is not an allowed field");
    }
    return record;
}

export function boundedArray<T>(
    value: unknown,
    field: string,
    parse: (entry: unknown, field: string) => T,
    options: Readonly<{ maximum?: number; minimum?: number }> = {},
): T[] {
    if (!Array.isArray(value)) {
        throw invalid(field, "must be an array");
    }
    const maximum = options.maximum ?? MAX_CONTRACT_COLLECTION_ENTRIES;
    const minimum = options.minimum ?? 0;
    if (value.length < minimum || value.length > maximum) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `${field} must contain between ${minimum} and ${maximum} entries`,
            field,
        );
    }
    return value.map((entry, index) => parse(entry, `${field}.${index}`));
}

export function assertUnique(values: readonly string[], field: string): void {
    if (new Set(values).size !== values.length) {
        throw invalid(field, "must not contain duplicate values");
    }
}

export function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
