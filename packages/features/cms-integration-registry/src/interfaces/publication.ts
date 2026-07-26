import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type {
    PinnedVerificationRunnerIdentity,
    ReviewedSchemaBaselineV1,
    VerificationPolicyIdentity,
    ValidatedIntegrationCandidateEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import type { TrustedSchemaDeclarationEvidence } from "./compatibility";
import type { IntegrationCompatibilityAdmissionReport } from "./compatibility";
import type { IntegrationRegistryCatalogSnapshot } from "./catalog";

export type IntegrationRegistryPublicationRequest = Readonly<{
    package: ResolvedIntegrationPackage;
    schemaDeclarationEvidence?: readonly TrustedSchemaDeclarationEvidence[];
}>;

export type IntegrationRegistryPublicationResult = Readonly<{
    operationId: string;
    kind: string;
    version: string;
    digest: string;
    report: IntegrationCompatibilityAdmissionReport;
    snapshot: IntegrationRegistryCatalogSnapshot;
}>;

export interface IntegrationRegistryPublisher {
    publish(request: IntegrationRegistryPublicationRequest): Promise<IntegrationRegistryPublicationResult>;
}

export const OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA = "cms.integration.official-bootstrap-plan.v1" as const;

export type OfficialBootstrapAnonymousConstraintFinding = Readonly<{
    path: string;
    line: number;
    column: number;
    kind: "anonymous-check" | "anonymous-unique";
}>;

export type OfficialBootstrapAnonymousConstraintGrandfathering = Readonly<{
    packageDigest: string;
    path: string;
    findings: readonly OfficialBootstrapAnonymousConstraintFinding[];
}>;

export type PreparedOfficialIntegrationPackage = Readonly<{
    package: ResolvedIntegrationPackage;
    anonymousConstraintGrandfathering: readonly OfficialBootstrapAnonymousConstraintGrandfathering[];
}>;

export type OfficialRepositoryBootstrapPlan = Readonly<{
    schema: typeof OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA;
    packages: readonly PreparedOfficialIntegrationPackage[];
    reviewedSchemaBaselines: readonly ReviewedSchemaBaselineV1[];
}>;

export type OfficialRepositoryBootstrapBaselineApproval = Readonly<{
    generator: PinnedVerificationRunnerIdentity;
    environmentDigests: readonly string[];
    policy: VerificationPolicyIdentity;
    provenanceActors: readonly string[];
}>;

export const INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA = "cms.integration.registry.candidate-record.v1" as const;

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

export type IntegrationRegistryCandidateRecord = Readonly<{
    schema: typeof INTEGRATION_REGISTRY_CANDIDATE_RECORD_SCHEMA;
    candidateId: string;
    revision: number;
    status: IntegrationRegistryCandidateStatus;
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    attemptCount: number;
    lease?: IntegrationRegistryCandidateLease;
    lastFailure?: IntegrationRegistryCandidateFailure;
}>;

export type CreateIntegrationRegistryCandidateInput = Readonly<{
    candidateId: string;
    candidate: ValidatedIntegrationCandidateEnvelopeV1;
    createdAt: string;
    expiresAt: string;
}>;
