import { assertIJson, canonicalIJsonBytes } from "../protocol/canonical";
import { ReleaseValidationError } from "../protocol/errors";
import { parseStrictJson } from "../protocol/json";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import {
    deepFreeze,
    expectArray,
    expectRecord,
    expectString,
    optionalString,
    rejectUnknownKeys,
} from "../protocol/values";
import type { ContractRelease } from "../../interfaces/ContractRelease";
import { createSchemaState } from "../schema/context";
import { parseCapability } from "./parseCapability";
import { parseIdentifier, parseSemVer } from "./identifiers";
import { parseFixtureAssets } from "./parseFixtureAssets";

export function parseContractRelease(
    value: unknown,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): ContractRelease {
    assertIJson(value, limits.maxJsonDepth);
    const record = expectRecord(value, "$", "invalid_contract");
    rejectUnknownKeys(
        record,
        [
            "kind",
            "protocol",
            "schemaDialect",
            "contractId",
            "name",
            "description",
            "version",
            "publisherId",
            "capabilities",
            "fixtureAssets",
        ],
        "$",
        "invalid_contract",
    );
    expectLiteral(record.kind, "contract", "$.kind");
    expectLiteral(record.protocol, "ulvia-provider/v1", "$.protocol");
    expectLiteral(record.schemaDialect, "ulvia-schema/v1", "$.schemaDialect");
    const source = expectArray(record.capabilities, "$.capabilities", "invalid_contract");
    if (source.length === 0 || source.length > limits.maxCapabilities) {
        throw new ReleaseValidationError(
            "invalid_contract",
            `capabilities must contain between 1 and ${limits.maxCapabilities} entries`,
            "$.capabilities",
        );
    }
    const schemaState = createSchemaState(limits);
    const fixtureAssets = parseFixtureAssets(record.fixtureAssets, limits);
    const assetsById = new Map(fixtureAssets?.map((asset) => [asset.id, asset]));
    const referencedAssets = new Set<string>();
    const capabilities = source.map((capability, index) =>
        parseCapability(capability, `$.capabilities[${index}]`, limits, schemaState, assetsById, referencedAssets),
    );
    for (const asset of fixtureAssets ?? []) {
        if (!referencedAssets.has(asset.id)) {
            throw new ReleaseValidationError("invalid_contract", `unused fixture asset ${asset.id}`, "$.fixtureAssets");
        }
    }
    if (new Set(capabilities.map((capability) => capability.id)).size !== capabilities.length) {
        throw new ReleaseValidationError("invalid_contract", "contains duplicate capability IDs", "$.capabilities");
    }
    validateDeprecationReferences(capabilities);
    const description = optionalString(record.description, "$.description", "invalid_contract", 4096);
    const release: ContractRelease = {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: parseIdentifier(record.contractId, "$.contractId", 96),
        name: expectString(record.name, "$.name", "invalid_contract", 128),
        ...(description ? { description } : {}),
        version: parseSemVer(record.version, "$.version"),
        publisherId: parseIdentifier(record.publisherId, "$.publisherId", 96),
        capabilities,
        ...(fixtureAssets === undefined ? {} : { fixtureAssets }),
    };
    if (canonicalIJsonBytes(release, limits.maxJsonDepth).byteLength > limits.maxDocumentBytes) {
        throw new ReleaseValidationError(
            "body_limit_exceeded",
            `canonical release exceeds ${limits.maxDocumentBytes} bytes`,
        );
    }
    return deepFreeze(release) as ContractRelease;
}

function validateDeprecationReferences(capabilities: ContractRelease["capabilities"]): void {
    const ids = new Set(capabilities.map((capability) => capability.id));
    for (const capability of capabilities) {
        const replacement = capability.deprecation?.replacedBy;
        if (replacement && (!ids.has(replacement) || replacement === capability.id)) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `replacement ${JSON.stringify(replacement)} must identify another capability in the release`,
                `$.capabilities.${capability.id}.deprecation.replacedBy`,
            );
        }
    }
}

export function parseContractReleaseJson(
    input: string | Uint8Array,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): ContractRelease {
    return parseContractRelease(parseStrictJson(input, limits.maxDocumentBytes, limits.maxJsonDepth), limits);
}

function expectLiteral(value: unknown, literal: string, path: string): void {
    if (value !== literal) {
        throw new ReleaseValidationError("invalid_contract", `must be ${JSON.stringify(literal)}`, path);
    }
}
