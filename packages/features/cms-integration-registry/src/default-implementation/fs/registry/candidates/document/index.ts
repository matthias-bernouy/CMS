import {
    INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA,
    LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V1_SCHEMA,
    type IntegrationRegistryCandidateRecord,
    type LegacyIntegrationRegistryCandidateRecordV1,
    type PersistedIntegrationRegistryCandidateRecord,
} from "cms-integration-registry/interfaces/publication";
import { readCanonicalJsonFile } from "../../persistence/canonicalFile";
import { FsIntegrationRegistryCandidateStoreError } from "../errors";
import { FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT } from "../layout";
import { digest, invalid, parseCandidateSharedFields, strictRecord } from "./fields";

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
const CURRENT_FIELDS = [
    ...LEGACY_FIELDS,
    "candidateDigest",
    "policyDigest",
    "admissionInputDigest",
    "verificationJobResultDigest",
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
    return parseIntegrationRegistryCandidateRecord(value);
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
        ...(input.verificationJobResultDigest === undefined
            ? {}
            : {
                  verificationJobResultDigest: digest(input.verificationJobResultDigest, "verificationJobResultDigest"),
              }),
    };
    assertAdmissionState(record);
    return Object.freeze(record);
}

export function requireCurrentIntegrationRegistryCandidateRecord(
    record: PersistedIntegrationRegistryCandidateRecord,
): IntegrationRegistryCandidateRecord {
    if (record.schema === LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V1_SCHEMA) {
        throw new FsIntegrationRegistryCandidateStoreError(
            "legacy_candidate",
            `Candidate ${record.candidateId} uses legacy record v1 and requires an explicit migration before admission`,
        );
    }
    return record;
}

function assertAdmissionState(record: IntegrationRegistryCandidateRecord): void {
    if (Boolean(record.policyDigest) !== Boolean(record.admissionInputDigest)) {
        invalid("Candidate policy and admission input digests must be present together");
    }
    if (["queued", "running", "passed", "publishing", "published"].includes(record.status)) {
        if (!record.policyDigest || !record.admissionInputDigest) {
            invalid(`Candidate ${record.status} status requires exact admission input digests`);
        }
    }
    if (["uploaded", "validating"].includes(record.status)) {
        if (record.policyDigest || record.admissionInputDigest || record.verificationJobResultDigest) {
            invalid(`Candidate ${record.status} status cannot carry admission results`);
        }
    }
    if (["passed", "publishing", "published"].includes(record.status) && !record.verificationJobResultDigest) {
        invalid(`Candidate ${record.status} status requires an exact verification job result digest`);
    }
    if (record.verificationJobResultDigest && record.attemptCount < 1) {
        invalid("Candidate result digest requires at least one worker attempt");
    }
    if (
        record.status === "queued" &&
        record.verificationJobResultDigest &&
        record.lastFailure?.kind !== "infrastructure"
    ) {
        invalid("Candidate queued result must describe a retryable infrastructure failure");
    }
    if (
        record.status === "rejected" &&
        record.lastFailure?.kind !== "validation" &&
        (!record.policyDigest || !record.admissionInputDigest || !record.verificationJobResultDigest)
    ) {
        invalid("Candidate verification rejection requires exact admission and result digests");
    }
}

function schemaOf(value: unknown): unknown {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>).schema
        : undefined;
}

export type { LegacyIntegrationRegistryCandidateRecordV1 };
