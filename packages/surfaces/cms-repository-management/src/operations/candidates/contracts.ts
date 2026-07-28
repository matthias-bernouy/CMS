import type {
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateRecord,
    IntegrationRegistryCandidatePlanningArtifacts,
    IntegrationRegistryCandidateStore,
} from "@bernouy/cms-integration-registry";
import type { IntegrationPackageEnvelopeV1, IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type {
    AdmissionDependencyReferenceV1,
    AdmissionInputSnapshotV1,
    BoundIntegrationVerificationAuthorSuiteV1,
    IntegrationVerificationEnvelopeV1,
    MigrationVerificationInputV1,
    ReleaseAdmissionPolicySnapshotV1,
    ValidatedIntegrationCandidateEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import type { Runner } from "@bernouy/http-runner";

export const REPOSITORY_MANAGEMENT_BASE_PATH = "/.cms/repository-management";
export const REPOSITORY_CANDIDATES_PATH = "/api/integrations/candidates";
export const REPOSITORY_CANDIDATE_STATUS_PATH = "/api/integrations/candidates/status";
export const REPOSITORY_CANDIDATE_REPORT_PATH = "/api/integrations/candidates/report";
export const REPOSITORY_VERIFICATION_JOBS_PATH = "/api/integrations/verification-jobs";
export const REPOSITORY_VERIFICATION_JOB_CLAIMS_PATH = "/api/integrations/verification-jobs/claims";
export const REPOSITORY_VERIFICATION_JOB_LEASE_PATH = "/api/integrations/verification-jobs/lease";
export const REPOSITORY_VERIFICATION_JOB_RESULT_CAPABILITIES_PATH =
    "/api/integrations/verification-jobs/result-capabilities";
export const REPOSITORY_VERIFICATION_JOB_RESULT_PATH = "/api/integrations/verification-jobs/result";

const REPOSITORY_MANAGEMENT_BASE_URL = new URL(
    `${REPOSITORY_MANAGEMENT_BASE_PATH}/`,
    "http://repository-management.invalid",
);

export function repositoryManagementAbsolutePath(path: string): string {
    if (!path.startsWith("/api/") || path.startsWith("//") || path.includes("#")) {
        throw new TypeError("Repository management API path must be an absolute /api/ path without a fragment");
    }
    const resolved = new URL(`.${path}`, REPOSITORY_MANAGEMENT_BASE_URL);
    if (!resolved.pathname.startsWith(`${REPOSITORY_MANAGEMENT_BASE_PATH}/api/`)) {
        throw new TypeError("Repository management API path escaped its mount point");
    }
    return `${resolved.pathname}${resolved.search}`;
}

export type RepositoryCandidateCapabilityIdentity = Readonly<{
    candidateId: string;
    jobId: string;
    attemptId: string;
    fencingToken: number;
    workerId: string;
    leaseExpiresAt: string;
    resultDigest: string;
}>;

export interface RepositoryCandidateCapabilityAuthority {
    issue(identity: RepositoryCandidateCapabilityIdentity): string;
    verify(token: string, now: string): RepositoryCandidateCapabilityIdentity | null;
}

export type RepositoryCandidateManagementRoutesConfig = Readonly<{
    store: IntegrationRegistryCandidateStore;
    admission: RepositoryCandidateAdmissionCoordinator;
    maxBodyBytes: number;
    candidateTtlMs: number;
    now(): string;
    createCandidateId(): string;
}>;

export type RepositoryCandidateAdmissionPlan = Readonly<{
    policy: ReleaseAdmissionPolicySnapshotV1;
    admission: AdmissionInputSnapshotV1;
    planningArtifacts?: IntegrationRegistryCandidatePlanningArtifacts;
    migrationInputs?: readonly MigrationVerificationInputV1[];
}>;

export type RepositoryCandidateAdmissionPlanner = (
    input: Readonly<{
        candidateId: string;
        candidate: ValidatedIntegrationCandidateEnvelopeV1;
    }>,
) => Promise<RepositoryCandidateAdmissionPlan>;

export interface RepositoryCandidateAdmissionCoordinator {
    submit(input: CreateIntegrationRegistryCandidateInput): Promise<IntegrationRegistryCandidateRecord>;
}

export interface RepositoryCandidatePublicationFinalizer {
    finalize(candidateId: string): Promise<IntegrationRegistryCandidateRecord>;
}

export type RepositoryCandidateWorkerRoutesConfig = Readonly<{
    store: IntegrationRegistryCandidateStore;
    packageSource?: Pick<IntegrationPackageSource, "getPackage">;
    authorSuites?: RepositoryCandidateAuthorSuiteResolver;
    capabilityAuthority: RepositoryCandidateCapabilityAuthority;
    maxBodyBytes: number;
    maxResultBodyBytes: number;
    leaseDurationMs: number;
    now(): string;
    createJobId(): string;
    createAttemptId(): string;
    publication?: RepositoryCandidatePublicationFinalizer;
}>;

export interface RepositoryCandidateAuthorSuiteResolver {
    resolve(
        input: Readonly<{
            candidate: IntegrationRegistryCandidateRecord;
            verification: IntegrationVerificationEnvelopeV1;
            admission: AdmissionInputSnapshotV1;
        }>,
    ): Promise<readonly BoundIntegrationVerificationAuthorSuiteV1[]>;
}

export type RepositoryCandidateExactMigrationPackage = Readonly<{
    digest: string;
    envelope: IntegrationPackageEnvelopeV1;
}>;

export type RepositoryCandidateExactDependencyPackage = Readonly<
    Required<Pick<AdmissionDependencyReferenceV1, "selection">> &
        Pick<AdmissionDependencyReferenceV1, "kind" | "version" | "packageDigest"> & {
            envelope: IntegrationPackageEnvelopeV1;
        }
>;

export type RepositoryCandidateWorkerSurfaceMount = Readonly<{
    mountAuthenticated(runner: Runner): void;
    mountCapabilities(runner: Runner): void;
}>;

export function projectCandidateStatus(record: IntegrationRegistryCandidateRecord) {
    return Object.freeze({
        candidateId: record.candidateId,
        revision: record.revision,
        status: record.status,
        kind: record.kind,
        version: record.version,
        candidateDigest: record.candidateDigest,
        packageDigest: record.packageDigest,
        verificationDigest: record.verificationDigest,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        expiresAt: record.expiresAt,
        attemptCount: record.attemptCount,
        ...(record.requestedChannel ? { requestedChannel: record.requestedChannel } : {}),
        ...(record.lease
            ? {
                  lease: {
                      jobId: record.lease.jobId,
                      attemptId: record.lease.attemptId,
                      fencingToken: record.lease.fencingToken,
                      workerId: record.lease.workerId,
                      claimedAt: record.lease.claimedAt,
                      leaseExpiresAt: record.lease.leaseExpiresAt,
                  },
              }
            : {}),
        ...(record.lastFailure
            ? {
                  lastFailure: {
                      kind: record.lastFailure.kind,
                      code: record.lastFailure.code,
                      occurredAt: record.lastFailure.occurredAt,
                  },
              }
            : {}),
    });
}
