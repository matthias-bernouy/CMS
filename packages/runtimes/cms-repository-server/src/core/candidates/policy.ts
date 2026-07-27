import type {
    MigrationVerificationEnvironmentV1,
    PinnedVerificationRunnerIdentity,
    ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import {
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
    identifyPlatformVerificationSuiteDefinition,
    identifyMigrationVerificationEnvironment,
} from "@bernouy/cms-integration-verification";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";

export async function productionReleaseAdmissionPolicy(
    runner: PinnedVerificationRunnerIdentity,
    migrationEnvironment?: MigrationVerificationEnvironmentV1,
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
        identity: { name: "repository-admission", version: "1.3.0" },
        staticEvaluator: { name: "repository-static-compatibility", version: "1.0.0" },
        verificationPolicy: { name: "repository-verification", version: "1.3.0" },
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
            ...(migrationEnvironment
                ? {
                      approvedEnvironmentDigests: [
                          (await identifyMigrationVerificationEnvironment(migrationEnvironment)).digest,
                      ],
                  }
                : {}),
            requireCmsMediatedCutoverEvidence: true,
            requireProviderDirectCutoverEvidence: true,
            requireRollbackEvidence: false,
            requireDelayedCleanupEvidence: false,
        },
    } satisfies ReleaseAdmissionPolicySnapshotV1);
}

export async function productionMigrationVerificationEnvironment(
    runner: PinnedVerificationRunnerIdentity,
): Promise<MigrationVerificationEnvironmentV1> {
    const runnerDigest = await sha256Hex(canonicalJsonBytes(runner));
    const bootstrapSqlDigest = await sha256Hex(
        canonicalJsonBytes({
            contract: "cms-integration-verifier-postgres-bootstrap-v1",
            schemas: ["extensions", "storage"],
            extensions: ["pgcrypto"],
        }),
    );
    return (
        await identifyMigrationVerificationEnvironment({
            schema: "cms.integration.migration-verification-environment.v1",
            postgres: {
                version: "16-alpine",
                imageDigest: "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
            },
            runner: { digest: runnerDigest, identity: runner },
            bootstrapSqlDigest,
            roles: [
                { name: "anon", attributes: ["no-bypassrls", "no-login"] },
                { name: "authenticated", attributes: ["no-bypassrls", "no-login"] },
                { name: "service_role", attributes: ["bypassrls", "no-login"] },
            ],
            grants: [],
            extensions: [{ name: "pgcrypto", version: "1.3" }],
            fixtures: [],
            sessionSettings: [{ name: "search_path", value: "public,extensions" }],
            policy: { name: "repository-migration", version: "1.0.0" },
        })
    ).environment;
}
