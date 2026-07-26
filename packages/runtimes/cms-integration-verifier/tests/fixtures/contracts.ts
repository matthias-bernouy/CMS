import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { ReleaseAdmissionPolicySnapshotV1 } from "@bernouy/cms-integration-verification";

export const DIGEST_A = "a".repeat(64);
export const DIGEST_B = "b".repeat(64);
export const DIGEST_C = "c".repeat(64);
export const IMAGE_DIGEST = `sha256:${DIGEST_A}`;
export const NOW = "2026-07-26T12:00:00.000Z";
export const LEASE_EXPIRY = "2026-07-26T13:00:00.000Z";

export function packageEnvelope(): IntegrationPackageEnvelopeV1 {
    return {
        schema: "cms.integration.package.v1",
        kind: "example",
        version: "1.2.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: "{}" },
            "release-notes.md": { encoding: "utf8", content: "Release" },
        },
    };
}

export async function policyFixture(): Promise<ReleaseAdmissionPolicySnapshotV1> {
    return {
        schema: "cms.integration.release-admission-policy.v1",
        identity: { name: "global-admission", version: "1.0.0" },
        staticEvaluator: { name: "static-compatibility", version: "1.0.0" },
        verificationPolicy: { name: "integration-verification", version: "1.0.0" },
        migrationPolicy: { name: "integration-migration", version: "1.0.0" },
        approvedRunners: [runnerFixture()],
        platformRequiredSuites: [{ suiteId: "platform-install", suiteDigest: DIGEST_C, runner: runnerFixture() }],
        findingResolutionRules: [],
        retry: { maximumAttempts: 2, retryableOutcomes: ["infrastructure-failure"] },
        cache: { mode: "disabled", minimumConcordantRuns: 1, maximumAgeSeconds: 0 },
        migrationEvidence: {
            requiredForReleaseLevels: [],
            requiredChecks: [],
            requireExactSourcePackageDigest: true,
            requireExactTargetPackageDigest: true,
            requireCmsMediatedCutoverEvidence: false,
            requireProviderDirectCutoverEvidence: false,
            requireRollbackEvidence: false,
            requireDelayedCleanupEvidence: false,
        },
    };
}

export function runnerFixture() {
    return { name: "cms-postgres", version: "1.2.3", imageDigest: IMAGE_DIGEST } as const;
}
