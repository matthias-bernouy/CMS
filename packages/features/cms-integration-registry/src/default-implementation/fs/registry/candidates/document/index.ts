import {
    INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA,
    LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V1_SCHEMA,
    LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V2_SCHEMA,
    type IntegrationRegistryCandidateRecord,
    type LegacyIntegrationRegistryCandidateRecordV1,
    type LegacyIntegrationRegistryCandidateRecordV2,
    type PersistedIntegrationRegistryCandidateRecord,
} from "cms-integration-registry/interfaces/publication";
import { readCanonicalJsonFile } from "../../persistence/canonicalFile";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import { FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT } from "../layout";
import { digest, digestArray, invalid, parseCandidateSharedFields, strictRecord } from "./fields";
import { assertCandidateAdmissionState } from "./state";

const LEGACY_FIELDS = [
    "schema",
    "candidateId",
    "revision",
    "status",
    "kind",
    "version",
    "packageDigest",
    "verificationDigest",
    "requestedChannel",
    "createdAt",
    "updatedAt",
    "expiresAt",
    "attemptCount",
    "lease",
    "lastFailure",
] as const;
const LEGACY_V2_FIELDS = [
    ...LEGACY_FIELDS,
    "candidateDigest",
    "policyDigest",
    "admissionInputDigest",
    "verificationJobResultDigest",
] as const;
const CURRENT_FIELDS = [
    ...LEGACY_V2_FIELDS,
    "compatibilityReportDigest",
    "statefulChangeSelectionDigest",
    "migrationInputDigests",
    "admissionJobResultDigest",
] as const;

export async function readPersistedIntegrationRegistryCandidateRecord(
    path: string,
): Promise<PersistedIntegrationRegistryCandidateRecord | null> {
    const value = await readCanonicalJsonFile(path, FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT);
    return value === null ? null : parsePersistedIntegrationRegistryCandidateRecord(value);
}

export async function readIntegrationRegistryCandidateRecord(
    path: string,
): Promise<IntegrationRegistryCandidateRecord | null> {
    const record = await readPersistedIntegrationRegistryCandidateRecord(path);
    return record === null ? null : requireCurrentIntegrationRegistryCandidateRecord(record);
}

export function parsePersistedIntegrationRegistryCandidateRecord(
    value: unknown,
): PersistedIntegrationRegistryCandidateRecord {
    if (schemaOf(value) === LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V1_SCHEMA) {
        const input = strictRecord(value, "legacy candidate record", LEGACY_FIELDS);
        return Object.freeze({
            schema: LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V1_SCHEMA,
            ...parseCandidateSharedFields(input),
        });
    }
    if (schemaOf(value) === LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V2_SCHEMA) {
        return parseLegacyV2Record(value);
    }
    return parseIntegrationRegistryCandidateRecord(value);
}

function parseLegacyV2Record(value: unknown): LegacyIntegrationRegistryCandidateRecordV2 {
    const input = strictRecord(value, "legacy candidate record v2", LEGACY_V2_FIELDS);
    return Object.freeze({
        schema: LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V2_SCHEMA,
        ...parseCandidateSharedFields(input),
        candidateDigest: digest(input.candidateDigest, "candidateDigest"),
        ...(input.policyDigest === undefined ? {} : { policyDigest: digest(input.policyDigest, "policyDigest") }),
        ...(input.admissionInputDigest === undefined
            ? {}
            : { admissionInputDigest: digest(input.admissionInputDigest, "admissionInputDigest") }),
        ...(input.verificationJobResultDigest === undefined
            ? {}
            : {
                  verificationJobResultDigest: digest(input.verificationJobResultDigest, "verificationJobResultDigest"),
              }),
    });
}

export function parseIntegrationRegistryCandidateRecord(value: unknown): IntegrationRegistryCandidateRecord {
    const input = strictRecord(value, "candidate record", CURRENT_FIELDS);
    if (input.schema !== INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA) {
        invalid(`Candidate record schema must be ${INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA}`);
    }
    const record: IntegrationRegistryCandidateRecord = {
        schema: INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA,
        ...parseCandidateSharedFields(input),
        candidateDigest: digest(input.candidateDigest, "candidateDigest"),
        ...(input.policyDigest === undefined ? {} : { policyDigest: digest(input.policyDigest, "policyDigest") }),
        ...(input.admissionInputDigest === undefined
            ? {}
            : { admissionInputDigest: digest(input.admissionInputDigest, "admissionInputDigest") }),
        ...(input.compatibilityReportDigest === undefined
            ? {}
            : { compatibilityReportDigest: digest(input.compatibilityReportDigest, "compatibilityReportDigest") }),
        ...(input.statefulChangeSelectionDigest === undefined
            ? {}
            : {
                  statefulChangeSelectionDigest: digest(
                      input.statefulChangeSelectionDigest,
                      "statefulChangeSelectionDigest",
                  ),
              }),
        ...(input.migrationInputDigests === undefined
            ? {}
            : { migrationInputDigests: digestArray(input.migrationInputDigests, "migrationInputDigests") }),
        ...(input.admissionJobResultDigest === undefined
            ? {}
            : { admissionJobResultDigest: digest(input.admissionJobResultDigest, "admissionJobResultDigest") }),
        ...(input.verificationJobResultDigest === undefined
            ? {}
            : {
                  verificationJobResultDigest: digest(input.verificationJobResultDigest, "verificationJobResultDigest"),
              }),
    };
    assertCandidateAdmissionState(record);
    return Object.freeze(record);
}

export function requireCurrentIntegrationRegistryCandidateRecord(
    record: PersistedIntegrationRegistryCandidateRecord,
): IntegrationRegistryCandidateRecord {
    if (record.schema !== INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "legacy_candidate",
            `Candidate ${record.candidateId} uses ${record.schema} and requires an explicit migration before admission`,
        );
    }
    return record;
}

function schemaOf(value: unknown): unknown {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>).schema
        : undefined;
}

export type { LegacyIntegrationRegistryCandidateRecordV1, LegacyIntegrationRegistryCandidateRecordV2 };
