import type {
    PinnedVerificationRunnerIdentity,
    ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import {
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
    identifyPlatformVerificationSuiteDefinition,
} from "@bernouy/cms-integration-verification";

export async function productionReleaseAdmissionPolicy(
    runner: PinnedVerificationRunnerIdentity,
): Promise<ReleaseAdmissionPolicySnapshotV1> {
    const platformRequiredSuites = await Promise.all(
        POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.map(async (definition) => ({
            suiteId: definition.suiteId,
            suiteDigest: (await identifyPlatformVerificationSuiteDefinition(definition)).digest,
            runner,
            applicability: definition.applicability,
        })),
    );
    return Object.freeze({
        schema: "cms.integration.release-admission-policy.v1",
        identity: { name: "repository-admission", version: "1.2.0" },
        staticEvaluator: { name: "repository-static-compatibility", version: "1.0.0" },
        verificationPolicy: { name: "repository-verification", version: "1.2.0" },
        migrationPolicy: { name: "repository-migration", version: "1.0.0" },
        approvedRunners: [runner],
        platformRequiredSuites,
        findingResolutionRules: [],
        retry: { maximumAttempts: 2, retryableOutcomes: ["infrastructure-failure"] },
        cache: { mode: "disabled", minimumConcordantRuns: 1, maximumAgeSeconds: 0 },
        migrationEvidence: {
            requiredForReleaseLevels: ["minor", "major"],
            requiredChecks: ["fresh-install", "migrated-state", "equivalence"],
            requireExactSourcePackageDigest: true,
            requireExactTargetPackageDigest: true,
            requireCmsMediatedCutoverEvidence: true,
            requireProviderDirectCutoverEvidence: true,
            requireRollbackEvidence: false,
            requireDelayedCleanupEvidence: false,
        },
    } satisfies ReleaseAdmissionPolicySnapshotV1);
}
