import type {
    MigrationVerificationEnvironmentV1,
    PinnedVerificationRunnerIdentity,
    ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import {
    CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1,
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
    const bootstrapSqlDigest = await sha256Hex(canonicalJsonBytes(CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.bootstrap));
    return (
        await identifyMigrationVerificationEnvironment({
            schema: "cms.integration.migration-verification-environment.v1",
            postgres: {
                ...CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.postgres,
            },
            runner: { digest: runnerDigest, identity: runner },
            bootstrapSqlDigest,
            roles: CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.roles,
            grants: [],
            extensions: CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.extensions,
            fixtures: [],
            sessionSettings: CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.sessionSettings,
            policy: { name: "repository-migration", version: "1.0.0" },
        })
    ).environment;
}
