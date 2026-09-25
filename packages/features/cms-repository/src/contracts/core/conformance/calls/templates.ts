import type { ContractFixtureAssetDefinition } from "../../../interfaces/ContractRelease";
import type { UlviaSchema } from "../../../interfaces/UlviaSchema";
import { firstSchemaSubsetViolation } from "../../compatibility/schemaAcceptance";
import { ReleaseValidationError } from "../../protocol/errors";
import { expectRecord } from "../../protocol/values";
import { SchemaValueError, validateSchemaValue } from "../../schema/validateValue";

export interface ConformanceTemplateContext {
    readonly assets: ReadonlyMap<string, ContractFixtureAssetDefinition>;
    readonly captures: ReadonlyMap<string, UlviaSchema>;
    readonly referencedAssets: Set<string>;
}

/** Check authored literals and captured-value types without inventing runtime values. */
export function validateConformanceTemplate(
    schema: UlviaSchema,
    value: unknown,
    path: string,
    context: ConformanceTemplateContext,
    literal = false,
): void {
    if (
        !literal &&
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.hasOwn(value, "$literal")
    ) {
        const marker = expectRecord(value, path, "invalid_contract");
        if (Object.keys(marker).length !== 1) {
            throw new ReleaseValidationError("invalid_contract", "literal reference must be { $literal: value }", path);
        }
        return validateConformanceTemplate(schema, marker.$literal, `${path}.$literal`, context, true);
    }
    if (
        !literal &&
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.hasOwn(value, "$capture")
    ) {
        const marker = expectRecord(value, path, "invalid_contract");
        if (Object.keys(marker).length !== 1 || typeof marker.$capture !== "string") {
            throw new ReleaseValidationError(
                "invalid_contract",
                "capture reference must be { $capture: string }",
                path,
            );
        }
        const captured = context.captures.get(marker.$capture);
        if (!captured) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "capture is undefined or belongs to a later call",
                path,
            );
        }
        const violation = firstSchemaSubsetViolation(captured, schema, path);
        if (violation) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "captured value is incompatible with target schema",
                violation,
            );
        }
        return;
    }
    if (value === null && "nullable" in schema && schema.nullable) {
        return;
    }
    switch (schema.type) {
        case "array": {
            if (!Array.isArray(value)) {
                return validateLiteral(schema, value, path);
            }
            checkCount(value.length, schema.minItems, schema.maxItems, path);
            value.forEach((item, index) =>
                validateConformanceTemplate(schema.items, item, `${path}[${index}]`, context, literal),
            );
            return;
        }
        case "binary": {
            const reference = expectRecord(value, path, "invalid_contract");
            if (Object.keys(reference).length !== 1 || typeof reference.assetId !== "string") {
                throw new ReleaseValidationError("invalid_contract", "binary value must be { assetId: string }", path);
            }
            const asset = context.assets.get(reference.assetId);
            if (!asset || !schema.mediaTypes.includes(asset.mediaType) || asset.byteLength > schema.maxBytes) {
                throw new ReleaseValidationError("invalid_contract", "incompatible or undeclared fixture asset", path);
            }
            context.referencedAssets.add(asset.id);
            return;
        }
        case "map": {
            const record = expectRecord(value, path, "invalid_contract");
            const entries = Object.entries(record);
            checkCount(entries.length, schema.minProperties, schema.maxProperties, path);
            for (const [key, item] of entries) {
                if (key.length > schema.maxKeyLength) {
                    throw new ReleaseValidationError(
                        "invalid_contract",
                        "map key exceeds maximum length",
                        `${path}.${key}`,
                    );
                }
                validateConformanceTemplate(schema.values, item, `${path}.${key}`, context, literal);
            }
            return;
        }
        case "object": {
            const record = expectRecord(value, path, "invalid_contract");
            const entries = Object.entries(record);
            checkCount(
                entries.length,
                schema.minProperties,
                schema.maxProperties ?? Object.keys(schema.properties).length,
                path,
            );
            for (const required of schema.required) {
                if (!Object.hasOwn(record, required)) {
                    throw new ReleaseValidationError("invalid_contract", `missing required property ${required}`, path);
                }
            }
            for (const [key, item] of entries) {
                if (!Object.hasOwn(schema.properties, key)) {
                    throw new ReleaseValidationError(
                        "invalid_contract",
                        `undeclared property ${key}`,
                        `${path}.${key}`,
                    );
                }
                validateConformanceTemplate(schema.properties[key]!, item, `${path}.${key}`, context, literal);
            }
            return;
        }
        default:
            validateLiteral(schema, value, path);
    }
}

function validateLiteral(schema: UlviaSchema, value: unknown, path: string): void {
    try {
        validateSchemaValue(schema, value, path);
    } catch (error) {
        if (error instanceof SchemaValueError) {
            throw new ReleaseValidationError("invalid_contract", error.message, error.path);
        }
        throw error;
    }
}

function checkCount(count: number, minimum: number | undefined, maximum: number, path: string): void {
    if (count < (minimum ?? 0) || count > maximum) {
        throw new ReleaseValidationError(
            "invalid_contract",
            `entry count must be between ${minimum ?? 0} and ${maximum}`,
            path,
        );
    }
}
