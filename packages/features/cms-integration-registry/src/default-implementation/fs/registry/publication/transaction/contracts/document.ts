import { integrationVersionSatisfies, isSupportedIntegrationVersionRange } from "@bernouy/cms-integrations";
import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type {
    IntegrationVerificationContractLineageKey,
    IntegrationVerificationContractLineageRevision,
} from "./types";

export const CONTRACT_LINEAGE_IDENTITY_SCHEMA = "cms.integration.verification-contract-lineage.v1" as const;
export const CONTRACT_LINEAGE_REVISION_SCHEMA = "cms.integration.verification-contract-lineage-revision.v1" as const;

const DIGEST = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function contractLineageIdentityDocument(key: IntegrationVerificationContractLineageKey) {
    return { schema: CONTRACT_LINEAGE_IDENTITY_SCHEMA, key: parseContractLineageKey(key) };
}

export function parseContractLineageIdentity(value: unknown): IntegrationVerificationContractLineageKey {
    const input = strictRecord(value, ["schema", "key"]);
    if (input.schema !== CONTRACT_LINEAGE_IDENTITY_SCHEMA) {
        throw new TypeError("Verification contract lineage identity schema is invalid");
    }
    return parseContractLineageKey(input.key);
}

export function contractLineageRevisionDocument(revision: IntegrationVerificationContractLineageRevision) {
    return { schema: CONTRACT_LINEAGE_REVISION_SCHEMA, revision: parseContractLineageRevision(revision) };
}

export function parseContractLineageRevision(value: unknown): IntegrationVerificationContractLineageRevision {
    const input = strictRecord(value, [
        "revisionId",
        "lineageId",
        "kind",
        "contractId",
        "ownerVersion",
        "ownerPackageDigest",
        "ownerVerificationDigest",
        "activeMajorRange",
        "entrypoint",
        "contractDigest",
        "createdAt",
        "provenance",
    ]);
    const kind = packageKind(input.kind);
    const contractId = identifier(input.contractId, "contractId");
    const ownerVersion = packageVersion(input.ownerVersion);
    const activeMajorRange = text(input.activeMajorRange, "activeMajorRange", 256);
    if (!isSupportedIntegrationVersionRange(activeMajorRange)) {
        throw new TypeError("Verification contract active major range is unsupported");
    }
    if (!integrationVersionSatisfies(ownerVersion, activeMajorRange)) {
        throw new TypeError("Verification contract owner version is outside its active range");
    }
    const provenance = strictRecord(input.provenance, ["candidateId", "decisionRevisionId", "decisionDigest"]);
    return Object.freeze({
        revisionId: identifier(input.revisionId, "revisionId"),
        lineageId: identifier(input.lineageId, "lineageId"),
        kind,
        contractId,
        ownerVersion,
        ownerPackageDigest: digest(input.ownerPackageDigest, "ownerPackageDigest"),
        ownerVerificationDigest: digest(input.ownerVerificationDigest, "ownerVerificationDigest"),
        activeMajorRange,
        entrypoint: text(input.entrypoint, "entrypoint", 4_096),
        contractDigest: digest(input.contractDigest, "contractDigest"),
        createdAt: timestamp(input.createdAt),
        provenance: Object.freeze({
            candidateId: identifier(provenance.candidateId, "candidateId"),
            decisionRevisionId: identifier(provenance.decisionRevisionId, "decisionRevisionId"),
            decisionDigest: digest(provenance.decisionDigest, "decisionDigest"),
        }),
    });
}

export function parseContractLineageRevisionDocument(value: unknown): IntegrationVerificationContractLineageRevision {
    const input = strictRecord(value, ["schema", "revision"]);
    if (input.schema !== CONTRACT_LINEAGE_REVISION_SCHEMA) {
        throw new TypeError("Verification contract lineage revision schema is invalid");
    }
    return parseContractLineageRevision(input.revision);
}

function parseContractLineageKey(value: unknown): IntegrationVerificationContractLineageKey {
    const input = strictRecord(value, ["kind", "contractId"]);
    return Object.freeze({
        kind: packageKind(input.kind),
        contractId: identifier(input.contractId, "contractId"),
    });
}

function packageKind(value: unknown): string {
    if (typeof value !== "string") {
        throw new TypeError("Verification contract kind is invalid");
    }
    assertIntegrationPackageKind(value);
    return value;
}

function packageVersion(value: unknown): string {
    if (typeof value !== "string") {
        throw new TypeError("Verification contract owner version is invalid");
    }
    assertIntegrationPackageVersion(value);
    return value;
}

function identifier(value: unknown, field: string): string {
    if (typeof value !== "string" || !IDENTIFIER.test(value)) {
        throw new TypeError(`Verification contract ${field} is invalid`);
    }
    return value;
}

function digest(value: unknown, field: string): string {
    if (typeof value !== "string" || !DIGEST.test(value)) {
        throw new TypeError(`Verification contract ${field} must be lowercase SHA-256`);
    }
    return value;
}

function text(value: unknown, field: string, maximum: number): string {
    if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > maximum) {
        throw new TypeError(`Verification contract ${field} is invalid`);
    }
    return value;
}

function timestamp(value: unknown): string {
    const parsed = text(value, "createdAt", 64);
    if (!Number.isFinite(Date.parse(parsed)) || new Date(parsed).toISOString() !== parsed) {
        throw new TypeError("Verification contract createdAt must be a canonical timestamp");
    }
    return parsed;
}

function strictRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Verification contract lineage document must be an object");
    }
    const input = value as Record<string, unknown>;
    const keys = Object.keys(input);
    if (keys.length !== fields.length || !fields.every((field) => keys.includes(field))) {
        throw new TypeError("Verification contract lineage document fields are invalid");
    }
    return input;
}
