import type { FindingResolutionPolicyRule } from "../finding";
import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../runner";

export const RELEASE_ADMISSION_POLICY_SNAPSHOT_SCHEMA = "cms.integration.release-admission-policy.v1" as const;

export type PlatformRequiredVerificationSuiteV1 = Readonly<{
    suiteId: string;
    suiteDigest: string;
    runner: PinnedVerificationRunnerIdentity;
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
