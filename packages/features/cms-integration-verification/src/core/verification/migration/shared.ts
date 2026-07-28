import type {
    MigrationRawObservationEvidenceV1,
    MigrationRawObservationStatus,
} from "../../../interfaces/verification/migration";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { oneOf, requiredText, sha256Digest, stableIdentifier } from "../../validation/values";
import { compareText } from "../shared";

export const MAX_MIGRATION_DEPENDENCIES = 128;
export const MAX_MIGRATION_DESCRIPTORS = 4_096;
export const MAX_MIGRATION_OBSERVATIONS = 256;
export const MAX_MIGRATION_EVIDENCE_DIGESTS = 128;
export const MAX_MIGRATION_DIAGNOSTIC_CODES = 128;

const OBSERVATION_STATUSES = ["passed", "failed", "not-supported", "not-applicable", "infrastructure-failure"] as const;

export function parseObservationEvidence(
    value: unknown,
    field: string,
    extraFields: readonly string[],
): Readonly<{ input: Record<string, unknown>; evidence: MigrationRawObservationEvidenceV1 }> {
    const input = strictRecord(value, field, ["status", "evidenceDigests", "diagnosticCodes", ...extraFields]);
    const status = oneOf(input.status, `${field}.status`, OBSERVATION_STATUSES);
    const evidenceDigests = canonicalDigests(input.evidenceDigests, `${field}.evidenceDigests`);
    const diagnosticCodes = canonicalIdentifiers(input.diagnosticCodes, `${field}.diagnosticCodes`);
    if ((status === "passed" || status === "failed") && evidenceDigests.length === 0) {
        invalid(`${field}.evidenceDigests`, `must contain evidence for ${status}`);
    }
    if (status === "infrastructure-failure" && diagnosticCodes.length === 0) {
        invalid(`${field}.diagnosticCodes`, "must describe an infrastructure failure");
    }
    return { input, evidence: { status, evidenceDigests, diagnosticCodes } };
}

export function canonicalDigests(value: unknown, field: string, maximum = MAX_MIGRATION_EVIDENCE_DIGESTS): string[] {
    const values = boundedArray(value, field, sha256Digest, { maximum });
    assertCanonicalUniqueOrder(values, field, (entry) => entry);
    return values;
}

export function canonicalIdentifiers(
    value: unknown,
    field: string,
    maximum = MAX_MIGRATION_DIAGNOSTIC_CODES,
): string[] {
    const values = boundedArray(value, field, stableIdentifier, { maximum });
    assertCanonicalUniqueOrder(values, field, (entry) => entry);
    return values;
}

export function migrationChecksum(value: unknown, field: string): `sha256:${string}` {
    const checksum = requiredText(value, field, 71);
    if (!/^sha256:[a-f0-9]{64}$/u.test(checksum)) {
        throw new IntegrationVerificationContractError(
            "invalid_digest",
            `${field} must be a lowercase sha256-prefixed digest`,
            field,
        );
    }
    return checksum as `sha256:${string}`;
}

export function optionalDigest(value: unknown, field: string): string | undefined {
    return value === undefined ? undefined : sha256Digest(value, field);
}

export function assertCanonicalUniqueOrder<T>(values: readonly T[], field: string, key: (value: T) => string): void {
    const keys = values.map(key);
    assertUnique(keys, field);
    const canonical = keys.toSorted(compareText);
    if (keys.some((entry, index) => entry !== canonical[index])) {
        invalid(field, "must use canonical lexical order");
    }
}

export function assertObservationPayload(
    status: MigrationRawObservationStatus,
    field: string,
    hasPayload: boolean,
): void {
    if ((status === "not-supported" || status === "not-applicable") && hasPayload) {
        invalid(field, `must not claim runtime payload for ${status}`);
    }
}

export function invalid(field: string, message: string): never {
    throw new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
