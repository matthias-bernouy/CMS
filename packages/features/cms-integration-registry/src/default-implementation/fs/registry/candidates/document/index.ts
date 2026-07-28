import {
    INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA,
    type IntegrationRegistryCandidateRecord,
} from "cms-integration-registry/interfaces/publication";
import { readCanonicalJsonFile } from "../../persistence/canonicalFile";
import { FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT } from "../layout";
import { digest, digestArray, invalid, parseCandidateSharedFields, strictRecord } from "./fields";
import { assertCandidateAdmissionState } from "./state";

const FIELDS = [
    "schema",
    "candidateId",
    "submittedBy",
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
    "candidateDigest",
    "policyDigest",
    "admissionInputDigest",
    "compatibilityReportDigest",
    "statefulChangeSelectionDigest",
    "migrationInputDigests",
    "admissionJobResultDigest",
] as const;

export async function readIntegrationRegistryCandidateRecord(
    path: string,
): Promise<IntegrationRegistryCandidateRecord | null> {
    const value = await readCanonicalJsonFile(path, FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT);
    return value === null ? null : parseIntegrationRegistryCandidateRecord(value);
}

export function parseIntegrationRegistryCandidateRecord(value: unknown): IntegrationRegistryCandidateRecord {
    const input = strictRecord(value, "candidate record", FIELDS);
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
    };
    assertCandidateAdmissionState(record);
    return Object.freeze(record);
}
