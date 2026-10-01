import { assertIJson, canonicalizeIJson, deepFreeze, parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { isVersionRangeSubset } from "cms-repository/exports/contracts/compatibility";
import { translateContractError } from "../contractErrors";
import { ProviderManifestValidationError } from "../errors";
import { DEFAULT_PROVIDER_MANIFEST_LIMITS, type ProviderManifestLimits } from "../limits";
import { expectRecord, expectString, rejectUnknownKeys } from "../values";
import type { ProviderManifest } from "../../interfaces/ProviderManifest";
import { parseVersionRange, parseSemVer, type VersionRange } from "../versioning/versionRange";
import { parseConfiguration } from "./parseConfiguration";
import { parseEndpointPolicy } from "./parseEndpoint";
import { parseIdentifier } from "./identifiers";
import { parseImplementations } from "./parseImplementations";
import {
    parseCredentialSlots,
    parseDataPolicy,
    parseManifestLinks,
    parseProvenance,
    parseRecoveryPolicy,
} from "./parsePolicies";

const encoder = new TextEncoder();

export function parseProviderManifest(
    value: unknown,
    limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
): ProviderManifest {
    try {
        assertIJson(value, limits.maxJsonDepth);
    } catch (error) {
        translateContractError(error);
    }
    const record = expectRecord(value, "$");
    rejectUnknownKeys(
        record,
        [
            "kind",
            "protocol",
            "schemaDialect",
            "providerId",
            "name",
            "links",
            "version",
            "provenance",
            "buildVersionRange",
            "endpoint",
            "configuration",
            "credentialSlots",
            "implementations",
            "dataPolicy",
            "recovery",
        ],
        "$",
    );
    expectLiteral(record.kind, "provider-manifest", "$.kind");
    expectLiteral(record.protocol, "ulvia-provider/v1", "$.protocol");
    expectLiteral(record.schemaDialect, "ulvia-schema/v1", "$.schemaDialect");
    const recovery = parseRecoveryPolicy(record.recovery, "$.recovery");
    const links = parseManifestLinks(record.links, "$.links");
    const dataPolicy = record.dataPolicy === undefined ? undefined : parseDataPolicy(record.dataPolicy, "$.dataPolicy");
    const manifest: ProviderManifest = {
        kind: "provider-manifest",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        providerId: parseIdentifier(record.providerId, "$.providerId", 96),
        name: expectString(record.name, "$.name", 128),
        ...(links ? { links } : {}),
        version: parseSemVer(record.version, "$.version"),
        provenance: parseProvenance(record.provenance, "$.provenance"),
        buildVersionRange: parseBuildVersionRange(record.buildVersionRange),
        endpoint: parseEndpointPolicy(record.endpoint, "$.endpoint", limits.maxAllowedOrigins),
        configuration: parseConfiguration(record.configuration, "$.configuration"),
        credentialSlots: parseCredentialSlots(record.credentialSlots, "$.credentialSlots", limits.maxCredentialSlots),
        implementations: parseImplementations(
            record.implementations,
            "$.implementations",
            limits.maxImplementations,
            limits.maxRequirementsPerImplementation,
        ),
        ...(dataPolicy ? { dataPolicy } : {}),
        ...(recovery ? { recovery } : {}),
    };
    assertCanonicalSize(manifest, limits);
    return deepFreeze(manifest) as ProviderManifest;
}

function parseBuildVersionRange(value: unknown): VersionRange {
    const path = "$.buildVersionRange";
    const range = parseVersionRange(value, path);
    // This target is empty: stable versions start at 0.0.0 and prereleases require explicit opt-in.
    if (isVersionRangeSubset(range, "<0.0.0")) {
        throw new ProviderManifestValidationError("invalid_manifest", "must accept at least one build version", path);
    }
    return range;
}

function assertCanonicalSize(manifest: ProviderManifest, limits: Readonly<ProviderManifestLimits>): void {
    let canonicalJson: string;
    try {
        canonicalJson = canonicalizeIJson(manifest, limits.maxJsonDepth);
    } catch (error) {
        translateContractError(error);
    }
    if (encoder.encode(canonicalJson).byteLength > limits.maxDocumentBytes) {
        throw new ProviderManifestValidationError(
            "body_limit_exceeded",
            `canonical manifest exceeds ${limits.maxDocumentBytes} bytes`,
        );
    }
}

export function parseProviderManifestJson(
    input: string | Uint8Array,
    limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
): ProviderManifest {
    let value: unknown;
    try {
        value = parseStrictJson(input, limits.maxDocumentBytes, limits.maxJsonDepth);
    } catch (error) {
        translateContractError(error);
    }
    return parseProviderManifest(value, limits);
}

function expectLiteral(value: unknown, literal: string, path: string): void {
    if (value !== literal) {
        throw new ProviderManifestValidationError("invalid_manifest", `must be ${JSON.stringify(literal)}`, path);
    }
}
