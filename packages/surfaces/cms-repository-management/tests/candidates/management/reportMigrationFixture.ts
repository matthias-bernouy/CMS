import type { IntegrationRegistryCandidateRecord } from "@bernouy/cms-integration-registry";
import type { MigrationJobResultV1, MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";

export function migrationInput(record: IntegrationRegistryCandidateRecord): MigrationVerificationInputV1 {
    return {
        source: { kind: record.kind, version: "1.1.0", packageDigest: "5".repeat(64) },
        target: { kind: record.kind, version: record.version, packageDigest: record.packageDigest },
        connectorKey: "primary",
        lineageId: "example-supabase-v1",
        sourceMigrationRevision: 1,
        targetMigrationRevision: 2,
        runner: { digest: "3".repeat(64) },
        environment: { digest: "4".repeat(64) },
        migrationPlan: { plan: { supportedSources: [{ range: "^1.1.0", migrationRevision: 1 }] } },
    } as MigrationVerificationInputV1;
}

export function migrationResult(
    input: MigrationVerificationInputV1,
    migrationInputDigest: string,
): MigrationJobResultV1 {
    const evidence = { status: "passed" as const, evidenceDigests: ["2".repeat(64)], diagnosticCodes: [] };
    const stateDigest = "1".repeat(64);
    return {
        schema: "cms.integration.migration-job-result.v1",
        jobId: "job-1",
        attemptId: "attempt-1",
        fencingToken: 1,
        migrationInputDigest,
        runnerDigest: input.runner.digest,
        environmentDigest: input.environment.digest,
        observations: {
            freshTarget: { ...evidence, stateDigest, functionDigests: [] },
            migratedTarget: { ...evidence, stateDigest, functionDigests: [] },
            equivalence: {
                ...evidence,
                freshStateDigest: stateDigest,
                migratedStateDigest: stateDigest,
                equivalent: true,
                differences: [],
            },
            ledger: { ...evidence, sourceRevision: 1, targetRevision: 2, rows: [] },
            replay: { ...evidence, firstStateDigest: stateDigest, replayStateDigest: stateDigest, unchanged: true },
            failureInjections: [],
            resumptions: [],
            cutover: {
                cmsMediated: {
                    ...evidence,
                    strategy: "binding-switch",
                    bindingRevisionBefore: "binding-1",
                    bindingRevisionAfter: "binding-2",
                },
                providerDirect: {
                    ...evidence,
                    strategy: "expand-in-code",
                    callbackIds: ["callback-1"],
                    signingSecretContinuityObserved: true,
                },
                activation: {
                    ...evidence,
                    activePackageDigest: input.target.packageDigest,
                    activeBindingDigest: "binding-2",
                    pointOfNoReturnCrossed: false,
                    cleanupObserved: false,
                },
            },
        },
    };
}
