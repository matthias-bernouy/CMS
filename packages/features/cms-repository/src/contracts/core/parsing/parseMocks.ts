import type {
    CapabilityErrorDefinition,
    CapabilityMockDefinition,
    ContractFixtureAssetDefinition,
} from "../../interfaces/ContractRelease";
import type { UlviaSchema } from "../../interfaces/UlviaSchema";
import { ReleaseValidationError } from "../protocol/errors";
import type { ReleaseLimits } from "../protocol/limits";
import { expectArray, expectRecord, optionalString, rejectUnknownKeys } from "../protocol/values";
import { SchemaValueError, validateSchemaValue } from "../schema/validateValue";
import { parseErrorCode, parseIdentifier } from "./identifiers";

export function parseMocks(
    value: unknown,
    path: string,
    inputSchema: UlviaSchema,
    outputSchema: UlviaSchema,
    errors: readonly CapabilityErrorDefinition[],
    assets: ReadonlyMap<string, ContractFixtureAssetDefinition>,
    referencedAssets: Set<string>,
    limits: Readonly<ReleaseLimits>,
): readonly CapabilityMockDefinition[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const source = expectArray(value, path, "invalid_contract");
    if (source.length > limits.maxMocksPerCapability) {
        throw new ReleaseValidationError("invalid_contract", "too many capability mocks", path);
    }
    const mocks = source.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        const record = expectRecord(item, itemPath, "invalid_contract");
        rejectUnknownKeys(record, ["id", "description", "input", "outcome"], itemPath, "invalid_contract");
        const input = expectRecord(record.input, `${itemPath}.input`, "invalid_contract");
        validateMockValue(inputSchema, input, `${itemPath}.input`, assets, referencedAssets);
        const outcome = parseOutcome(
            record.outcome,
            `${itemPath}.outcome`,
            outputSchema,
            errors,
            assets,
            referencedAssets,
        );
        const description = optionalString(record.description, `${itemPath}.description`, "invalid_contract", 4096);
        return {
            id: parseIdentifier(record.id, `${itemPath}.id`),
            ...(description ? { description } : {}),
            input,
            outcome,
        };
    });
    if (new Set(mocks.map((mock) => mock.id)).size !== mocks.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate mock IDs", path);
    }
    return mocks;
}

function parseOutcome(
    value: unknown,
    path: string,
    successSchema: UlviaSchema,
    errors: readonly CapabilityErrorDefinition[],
    assets: ReadonlyMap<string, ContractFixtureAssetDefinition>,
    referencedAssets: Set<string>,
): CapabilityMockDefinition["outcome"] {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["kind", "code", "output"], path, "invalid_contract");
    if (record.kind === "success") {
        if (Object.hasOwn(record, "code") || !Object.hasOwn(record, "output")) {
            throw new ReleaseValidationError("invalid_contract", "success requires output and forbids code", path);
        }
        validateMockValue(successSchema, record.output, `${path}.output`, assets, referencedAssets);
        return { kind: "success", output: record.output };
    }
    if (record.kind !== "error") {
        throw new ReleaseValidationError("invalid_contract", "outcome kind must be success or error", `${path}.kind`);
    }
    const code = parseErrorCode(record.code, `${path}.code`);
    const error = errors.find((candidate) => candidate.code === code);
    if (!error) {
        throw new ReleaseValidationError("invalid_contract", "mock error code is not declared", `${path}.code`);
    }
    if (Object.hasOwn(record, "output") !== (error.output !== undefined)) {
        throw new ReleaseValidationError("invalid_contract", "mock error output must match its declaration", path);
    }
    if (error.output) {
        validateMockValue(error.output, record.output, `${path}.output`, assets, referencedAssets);
    }
    return { kind: "error", code, ...(error.output ? { output: record.output } : {}) };
}

function validateMockValue(
    schema: UlviaSchema,
    value: unknown,
    path: string,
    assets: ReadonlyMap<string, ContractFixtureAssetDefinition>,
    referencedAssets: Set<string>,
): void {
    try {
        validateSchemaValue(schema, materializeBinaryReferences(schema, value, path, assets, referencedAssets), path);
    } catch (error) {
        if (error instanceof SchemaValueError) {
            throw new ReleaseValidationError("invalid_contract", error.message, error.path);
        }
        throw error;
    }
}

function materializeBinaryReferences(
    schema: UlviaSchema,
    value: unknown,
    path: string,
    assets: ReadonlyMap<string, ContractFixtureAssetDefinition>,
    referencedAssets: Set<string>,
): unknown {
    if (value === null && "nullable" in schema && schema.nullable) {
        return null;
    }
    if (schema.type === "binary") {
        const reference = expectRecord(value, path, "invalid_contract");
        if (Object.keys(reference).length !== 1 || typeof reference.assetId !== "string") {
            throw new ReleaseValidationError("invalid_contract", "binary mock value must be { assetId: string }", path);
        }
        const asset = assets.get(reference.assetId);
        if (!asset || !schema.mediaTypes.includes(asset.mediaType) || asset.byteLength > schema.maxBytes) {
            throw new ReleaseValidationError("invalid_contract", "incompatible or undeclared fixture asset", path);
        }
        referencedAssets.add(asset.id);
        return new Uint8Array(0);
    }
    if (schema.type === "array" && Array.isArray(value)) {
        assertMockCount(value.length, schema.minItems, schema.maxItems, path);
        return value.map((item, index) =>
            materializeBinaryReferences(schema.items, item, `${path}[${index}]`, assets, referencedAssets),
        );
    }
    if (
        (schema.type === "object" || schema.type === "map") &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    ) {
        const maximum =
            schema.type === "map"
                ? schema.maxProperties
                : (schema.maxProperties ?? Object.keys(schema.properties).length);
        assertMockCount(Object.keys(value).length, schema.minProperties, maximum, path);
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => {
                const child =
                    schema.type === "map"
                        ? schema.values
                        : Object.hasOwn(schema.properties, key)
                          ? schema.properties[key]
                          : undefined;
                return [
                    key,
                    child ? materializeBinaryReferences(child, item, `${path}.${key}`, assets, referencedAssets) : item,
                ];
            }),
        );
    }
    return value;
}

function assertMockCount(count: number, minimum: number | undefined, maximum: number, path: string): void {
    if (count < (minimum ?? 0) || count > maximum) {
        throw new SchemaValueError(`entry count must be between ${minimum ?? 0} and ${maximum}`, path);
    }
}
