import type {
    AdmissionInputSnapshotV1,
    CompatibilityReportV2,
    ReleaseAdmissionPolicySnapshotV1,
    StatefulChangeSelectionV1,
    ValidatedIntegrationCandidateEnvelopeV1,
    VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";

export const LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V1_SCHEMA =
    "cms.integration.registry.candidate-record.v1" as const;
export const LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V2_SCHEMA =
    "cms.integration.registry.candidate-record.v2" as const;
export const INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA = "cms.integration.registry.candidate-record.v3" as const;

export type IntegrationRegistryCandidateStatus =
    | "uploaded"
    | "validating"
    | "queued"
    | "running"
    | "passed"
    | "publishing"
    | "published"
    | "rejected"
    | "expired";

export type IntegrationRegistryCandidateLease = Readonly<{
    jobId: string;
    attemptId: string;
    fencingToken: number;
    workerId: string;
    claimedAt: string;
    leaseExpiresAt: string;
}>;

export type IntegrationRegistryCandidateFailure = Readonly<{
    kind: "validation" | "suite" | "infrastructure" | "stale";
    code: string;
    message: string;
    occurredAt: string;
}>;

type IntegrationRegistryCandidateRecordShared = Readonly<{
    candidateId: string;
    revision: number;
    status: IntegrationRegistryCandidateStatus;
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
    requestedChannel?: "latest";
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    attemptCount: number;
    lease?: IntegrationRegistryCandidateLease;
    lastFailure?: IntegrationRegistryCandidateFailure;
}>;

export type LegacyIntegrationRegistryCandidateRecordV1 = IntegrationRegistryCandidateRecordShared &
    Readonly<{ schema: typeof LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V1_SCHEMA }>;

export type LegacyIntegrationRegistryCandidateRecordV2 = IntegrationRegistryCandidateRecordShared &
    Readonly<{
        schema: typeof LEGACY_INTEGRATION_REGISTRY_CANDIDATE_RECORD_V2_SCHEMA;
        candidateDigest: string;
        policyDigest?: string;
        admissionInputDigest?: string;
        verificationJobResultDigest?: string;
    }>;

export type IntegrationRegistryCandidateRecord = IntegrationRegistryCandidateRecordShared &
    Readonly<{
        schema: typeof INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA;
        candidateDigest: string;
        policyDigest?: string;
        admissionInputDigest?: string;
        compatibilityReportDigest?: string;
        statefulChangeSelectionDigest?: string;
        verificationJobResultDigest?: string;
    }>;

export type PersistedIntegrationRegistryCandidateRecord =
    | LegacyIntegrationRegistryCandidateRecordV1
    | LegacyIntegrationRegistryCandidateRecordV2
    | IntegrationRegistryCandidateRecord;

export type CreateIntegrationRegistryCandidateInput = Readonly<{
    candidateId: string;
    candidate: ValidatedIntegrationCandidateEnvelopeV1;
    createdAt: string;
    expiresAt: string;
}>;

export type QueueIntegrationRegistryCandidateInput = Readonly<{
    expectedRevision: number;
    now: string;
    policy: ReleaseAdmissionPolicySnapshotV1;
    admission: AdmissionInputSnapshotV1;
    planningArtifacts?: Readonly<{
        compatibilityReportDigest: string;
        statefulChangeSelectionDigest: string;
    }>;
}>;

export type PersistIntegrationRegistryCandidatePlanningInput = Readonly<{
    expectedRevision: number;
    compatibilityReport: CompatibilityReportV2;
    compatibilityEvaluatorInputDigest: string;
    statefulChanges: StatefulChangeSelectionV1;
}>;

export type RejectIntegrationRegistryCandidateValidationInput = Readonly<{
    expectedRevision: number;
    now: string;
    failure: IntegrationRegistryCandidateFailure & Readonly<{ kind: "validation" }>;
}>;

export type ClaimIntegrationRegistryCandidateInput = Readonly<{
    expectedRevision: number;
    jobId: string;
    attemptId: string;
    workerId: string;
    now: string;
    leaseExpiresAt: string;
}>;

export type CompleteIntegrationRegistryCandidateInput = Readonly<{
    expectedRevision: number;
    now: string;
    result: VerificationJobResultV1;
}>;

export type BeginIntegrationRegistryCandidatePublicationInput = Readonly<{
    expectedRevision: number;
    now: string;
}>;

export type CompleteIntegrationRegistryCandidatePublicationInput = Readonly<{
    expectedRevision: number;
    now: string;
}>;

export type RejectIntegrationRegistryCandidatePublicationInput = Readonly<{
    expectedRevision: number;
    now: string;
    failure: IntegrationRegistryCandidateFailure & Readonly<{ kind: "stale" }>;
}>;
