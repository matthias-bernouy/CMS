import type {
    PinnedVerificationRunnerIdentity,
    ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";

const PLATFORM_INSTALL_SUITE_DIGEST = "b5ca8731bb3f5d3eb12df84be951b587a57b157486f94d404b136818ef9b9401";

export function productionReleaseAdmissionPolicy(
    runner: PinnedVerificationRunnerIdentity,
): ReleaseAdmissionPolicySnapshotV1 {
    return Object.freeze({
        schema: "cms.integration.release-admission-policy.v1",
        identity: { name: "repository-admission", version: "1.0.0" },
        staticEvaluator: { name: "repository-static-compatibility", version: "1.0.0" },
        verificationPolicy: { name: "repository-verification", version: "1.0.0" },
        migrationPolicy: { name: "repository-migration", version: "1.0.0" },
        approvedRunners: [runner],
        platformRequiredSuites: [
            {
                suiteId: "platform-install",
                suiteDigest: PLATFORM_INSTALL_SUITE_DIGEST,
                runner,
            },
        ],
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
