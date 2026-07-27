import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type {
    AdmissionInputSnapshotV1,
    AdmissionBehavioralRlsPlanBindingV1,
    BoundIntegrationVerificationAuthorSuiteV1,
    CandidateAdmissionJobResultV1,
    IntegrationVerificationEnvelopeV1,
    ReleaseAdmissionPolicySnapshotV1,
    MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";

export type CandidateLeaseProjection = Readonly<{
    jobId: string;
    attemptId: string;
    fencingToken: number;
    workerId: string;
    claimedAt: string;
    leaseExpiresAt: string;
}>;

export type CandidateStatusProjection = Readonly<{
    candidateId: string;
    revision: number;
    status:
        | "uploaded"
        | "validating"
        | "queued"
        | "running"
        | "passed"
        | "publishing"
        | "published"
        | "rejected"
        | "expired";
    kind: string;
    version: string;
    candidateDigest: string;
    packageDigest: string;
    verificationDigest: string;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    attemptCount: number;
    requestedChannel?: "latest";
    lease?: CandidateLeaseProjection;
    lastFailure?: Readonly<{
        kind: "validation" | "suite" | "infrastructure" | "stale";
        code: string;
        occurredAt: string;
    }>;
}>;

export type ExactVerificationWorkload = Readonly<{
    package: IntegrationPackageEnvelopeV1;
    verification: IntegrationVerificationEnvelopeV1;
    policy: ReleaseAdmissionPolicySnapshotV1;
    admission: AdmissionInputSnapshotV1;
    behavioralRlsPlan?: AdmissionBehavioralRlsPlanBindingV1;
    authorSuites: readonly BoundIntegrationVerificationAuthorSuiteV1[];
    dependencyPackages: readonly ExactDependencyPackage[];
    migrationInputs: readonly MigrationVerificationInputV1[];
    migrationPackages: readonly ExactMigrationPackage[];
}>;

export type ExactDependencyPackage = Readonly<{
    selection: "minimum" | "stable";
    kind: string;
    version: string;
    packageDigest: string;
    envelope: IntegrationPackageEnvelopeV1;
}>;

export type ExactMigrationPackage = Readonly<{
    digest: string;
    envelope: IntegrationPackageEnvelopeV1;
}>;

export type ClaimedVerificationJob = Readonly<{
    candidate: CandidateStatusProjection & Readonly<{ status: "running"; lease: CandidateLeaseProjection }>;
    workload: ExactVerificationWorkload;
}>;

export type ResultCapability = Readonly<{
    token: string;
    expiresAt: string;
    resultDigest: string;
}>;

export interface CandidateWorkerClient {
    listClaimable(limit: number): Promise<readonly CandidateStatusProjection[]>;
    claim(candidate: CandidateStatusProjection): Promise<ClaimedVerificationJob>;
    renew(candidate: ClaimedVerificationJob["candidate"]): Promise<ClaimedVerificationJob["candidate"]>;
    seal(candidate: ClaimedVerificationJob["candidate"], resultDigest: string): Promise<ResultCapability>;
    submit(
        candidate: ClaimedVerificationJob["candidate"],
        capability: ResultCapability,
        result: CandidateAdmissionJobResultV1,
    ): Promise<CandidateStatusProjection>;
}
