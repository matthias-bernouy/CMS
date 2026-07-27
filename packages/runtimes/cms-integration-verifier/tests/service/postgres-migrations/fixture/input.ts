import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1,
    identifyMigrationVerificationEnvironment,
    identifyMigrationVerificationInput,
    identifyReleaseAdmissionPolicySnapshot,
    identifyStatefulChangeSelection,
    type MigrationJobAttemptIdentityV1,
    type MigrationVerificationEnvironmentV1,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import { POSTGRES_IMAGE } from "../../postgresFixture";
import { migrationPackageFixture, type MigrationPackageFixture } from "./packages";

export const ATTEMPT: MigrationJobAttemptIdentityV1 = {
    jobId: "migration-job-1",
    attemptId: "migration-attempt-1",
    fencingToken: 1,
};

export async function migrationExecutionFixture(
    database: { databaseId: string; connectionUri: string },
    packages?: MigrationPackageFixture,
    mutateEnvironment?: (environment: MigrationVerificationEnvironmentV1) => MigrationVerificationEnvironmentV1,
) {
    const release = packages ?? (await migrationPackageFixture());
    const runner = {
        name: "cms-postgres",
        version: "1.2.3",
        imageDigest: POSTGRES_IMAGE.slice("postgres:16-alpine@".length),
    } as const;
    const runnerDigest = await sha256Hex(canonicalJsonBytes(runner));
    const bootstrapSqlDigest = await sha256Hex(canonicalJsonBytes(CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.bootstrap));
    const environmentManifest: MigrationVerificationEnvironmentV1 = {
        schema: "cms.integration.migration-verification-environment.v1",
        postgres: CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.postgres,
        runner: { digest: runnerDigest, identity: runner },
        bootstrapSqlDigest,
        roles: CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.roles,
        grants: CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.grants,
        extensions: CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.extensions,
        fixtures: [],
        sessionSettings: CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1.sessionSettings,
        policy: { name: "integration-migration", version: "1.0.0" },
    };
    const environment = await identifyMigrationVerificationEnvironment(
        mutateEnvironment ? mutateEnvironment(structuredClone(environmentManifest)) : environmentManifest,
    );
    const policy = await identifiedPolicy(runner, environment.digest);
    const source = {
        kind: release.source.envelope.kind,
        version: release.source.envelope.version,
        packageDigest: release.source.digest,
    };
    const target = {
        kind: release.target.envelope.kind,
        version: release.target.envelope.version,
        packageDigest: release.target.digest,
    };
    const selection = await identifyStatefulChangeSelection({
        schema: "cms.integration.stateful-change-selection.v1",
        selector: policy.snapshot.migrationPolicy,
        policySnapshotDigest: policy.digest,
        target,
        compatibilityReport: { revisionId: "compatibility-1", reportDigest: "d".repeat(64) },
        requiredMigrations: [{ source, connectorKey: release.connectorKey, lineageId: release.lineageId }],
    });
    const planDigest = await sha256Hex(canonicalJsonBytes(release.targetPlan));
    const identified = await identifyMigrationVerificationInput({
        schema: "cms.integration.migration-verification-input.v1",
        source,
        target,
        dependencyMatrices: [
            { selection: "minimum", dependencies: [] },
            { selection: "stable", dependencies: [] },
        ],
        connectorKey: release.connectorKey,
        lineageId: release.lineageId,
        sourceMigrationRevision: release.sourceMigrationRevision,
        targetMigrationRevision: release.targetMigrationRevision,
        statefulChanges: { digest: selection.digest, selection: selection.selection },
        migrationPlan: { digest: planDigest, plan: release.targetPlan },
        policy: { digest: policy.digest, snapshot: policy.snapshot },
        runner: { digest: runnerDigest, identity: runner },
        environment: { digest: environment.digest, manifest: environment.environment },
    });
    return {
        packages: release,
        input: {
            targetPackage: release.target.envelope,
            migrationPackages: [release.source],
            migrationInputs: [identified.input],
            attempt: ATTEMPT,
            database,
        },
        migrationInputDigest: identified.digest,
    };
}

async function identifiedPolicy(
    runner: ReleaseAdmissionPolicySnapshotV1["approvedRunners"][number],
    environmentDigest: string,
) {
    return await identifyReleaseAdmissionPolicySnapshot({
        schema: "cms.integration.release-admission-policy.v1",
        identity: { name: "global-admission", version: "1.0.0" },
        staticEvaluator: { name: "static-compatibility", version: "1.0.0" },
        verificationPolicy: { name: "integration-verification", version: "1.0.0" },
        migrationPolicy: { name: "integration-migration", version: "1.0.0" },
        approvedRunners: [runner],
        platformRequiredSuites: [{ suiteId: "platform-install", suiteDigest: "e".repeat(64), runner }],
        findingResolutionRules: [],
        retry: { maximumAttempts: 1, retryableOutcomes: [] },
        cache: { mode: "disabled", minimumConcordantRuns: 1, maximumAgeSeconds: 0 },
        migrationEvidence: {
            requiredForReleaseLevels: ["minor"],
            requiredChecks: ["fresh-install", "migrated-state", "equivalence"],
            requireExactSourcePackageDigest: true,
            requireExactTargetPackageDigest: true,
            approvedEnvironmentDigests: [environmentDigest],
            requireCmsMediatedCutoverEvidence: false,
            requireProviderDirectCutoverEvidence: false,
            requireRollbackEvidence: false,
            requireDelayedCleanupEvidence: false,
        },
    });
}
