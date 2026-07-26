import type { FindingResolutionPolicyRule } from "../finding";
import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../runner";

export const RELEASE_ADMISSION_POLICY_SNAPSHOT_SCHEMA = "cms.integration.release-admission-policy.v1" as const;

export type PlatformVerificationSuiteApplicabilityV1 = "always" | "sql-connectors" | "data-api-schemas";

export type PlatformRequiredVerificationSuiteV1 = Readonly<{
    suiteId: string;
    suiteDigest: string;
    runner: PinnedVerificationRunnerIdentity;
    /** Missing only on policy snapshots written before applicability was introduced. */
    applicability?: PlatformVerificationSuiteApplicabilityV1;
}>;

export type VerificationRetryPolicyV1 = Readonly<{
    maximumAttempts: number;
    retryableOutcomes: readonly "infrastructure-failure"[];
}>;

export type VerificationCachePolicyV1 = Readonly<{
    mode: "disabled" | "passed-only";
    minimumConcordantRuns: number;
    maximumAgeSeconds: number;
}>;

export type MigrationEvidencePolicyV1 = Readonly<{
    requiredForReleaseLevels: readonly ("patch" | "minor" | "major")[];
    requiredChecks: readonly (
        | "fresh-install"
        | "migrated-state"
        | "equivalence"
        | "failure-injection"
        | "resumption"
    )[];
    requireExactSourcePackageDigest: true;
    requireExactTargetPackageDigest: true;
    /** Missing only on historical policy snapshots written before environment pinning. */
    approvedEnvironmentDigests?: readonly string[];
    requireCmsMediatedCutoverEvidence: boolean;
    requireProviderDirectCutoverEvidence: boolean;
    requireRollbackEvidence: boolean;
    requireDelayedCleanupEvidence: boolean;
}>;

export type ReleaseAdmissionPolicySnapshotV1 = Readonly<{
    schema: typeof RELEASE_ADMISSION_POLICY_SNAPSHOT_SCHEMA;
    identity: VerificationPolicyIdentity;
    staticEvaluator: VerificationPolicyIdentity;
    verificationPolicy: VerificationPolicyIdentity;
    migrationPolicy: VerificationPolicyIdentity;
    approvedRunners: readonly PinnedVerificationRunnerIdentity[];
    platformRequiredSuites: readonly PlatformRequiredVerificationSuiteV1[];
    findingResolutionRules: readonly FindingResolutionPolicyRule[];
    retry: VerificationRetryPolicyV1;
    cache: VerificationCachePolicyV1;
    migrationEvidence: MigrationEvidencePolicyV1;
}>;

export type IdentifiedReleaseAdmissionPolicySnapshotV1 = Readonly<{
    snapshot: ReleaseAdmissionPolicySnapshotV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;
