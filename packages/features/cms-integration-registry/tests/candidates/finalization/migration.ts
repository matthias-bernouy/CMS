import {
    identifyMigrationVerificationInput,
    type MigrationJobResultV1,
    type MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";

export async function passedMigrationResult(
    input: MigrationVerificationInputV1,
    lease: Readonly<{ jobId: string; attemptId: string; fencingToken: number }>,
    observationStatus: "passed" | "failed" | "infrastructure-failure" = "passed",
): Promise<MigrationJobResultV1> {
    const identified = await identifyMigrationVerificationInput(input);
    const stateDigest = "3".repeat(64);
    const schemaDigest = "4".repeat(64);
    const evidence = { status: "passed" as const, evidenceDigests: ["5".repeat(64)], diagnosticCodes: [] };
    const unsupported = {
        status: "not-supported" as const,
        evidenceDigests: [],
        diagnosticCodes: ["sql-runner-does-not-exercise-cutover"],
    };
    const covered = input.migrationPlan.plan.install.coveredMigrations;
    const sourceRows = covered.filter((entry) => entry.revision <= input.sourceMigrationRevision).length;
    return {
        schema: "cms.integration.migration-job-result.v1",
        jobId: lease.jobId,
        attemptId: lease.attemptId,
        fencingToken: lease.fencingToken,
        migrationInputDigest: identified.digest,
        runnerDigest: input.runner.digest,
        environmentDigest: input.environment.digest,
        observations: {
            freshTarget: { ...evidence, stateDigest, schemaDigest, functionDigests: [] },
            migratedTarget: { ...evidence, stateDigest, schemaDigest, functionDigests: [] },
            equivalence: {
                ...evidence,
                freshStateDigest: stateDigest,
                migratedStateDigest: stateDigest,
                equivalent: true,
                differences: [],
            },
            ledger: {
                ...evidence,
                sourceRevision: input.sourceMigrationRevision,
                targetRevision: input.targetMigrationRevision,
                freshBaselineRecorded: true,
                migrationAndLedgerAtomic: true,
                checksumMismatchRejected: true,
                emptyLedgerRejected: true,
                rows: covered.map((entry) => ({
                    migrationId: entry.id,
                    checksum: entry.checksum,
                    revision: entry.revision,
                    attemptId: entry.revision > input.sourceMigrationRevision ? lease.attemptId : "source-install",
                    ...(entry.revision > input.sourceMigrationRevision
                        ? {
                              sourcePackageDigest: input.source.packageDigest,
                              targetPackageDigest: input.target.packageDigest,
                          }
                        : {}),
                })),
            },
            replay: {
                ...evidence,
                firstStateDigest: stateDigest,
                replayStateDigest: stateDigest,
                unchanged: true,
                ledgerRowsBefore: sourceRows,
                ledgerRowsAfterFirstRun: covered.length,
                ledgerRowsAfterReplay: covered.length,
            },
            failureInjections: migrationFailureObservations(observationStatus),
            resumptions: [],
            cutover: {
                cmsMediated: input.migrationPlan.plan.cmsMediated
                    ? { ...unsupported, strategy: "binding-switch" }
                    : {
                          status: "not-applicable",
                          evidenceDigests: [],
                          diagnosticCodes: [],
                          strategy: "not-applicable",
                      },
                providerDirect: input.migrationPlan.plan.providerDirect
                    ? {
                          ...unsupported,
                          strategy: input.migrationPlan.plan.providerDirect.strategy,
                          callbackIds: input.migrationPlan.plan.providerDirect.callbackIds,
                      }
                    : {
                          status: "not-applicable",
                          evidenceDigests: [],
                          diagnosticCodes: [],
                          strategy: "not-applicable",
                          callbackIds: [],
                      },
                activation: unsupported,
            },
        },
    };
}

function migrationFailureObservations(
    status: "passed" | "failed" | "infrastructure-failure",
): MigrationJobResultV1["observations"]["failureInjections"] {
    if (status === "passed") {
        return [];
    }
    return status === "failed"
        ? [
              {
                  status,
                  evidenceDigests: ["6".repeat(64)],
                  diagnosticCodes: [],
                  boundary: "after-expand",
                  injected: true,
                  recovery: "operator-required",
              },
          ]
        : [
              {
                  status,
                  evidenceDigests: [],
                  diagnosticCodes: ["injected-boundary-unavailable"],
                  boundary: "after-expand",
                  injected: false,
                  recovery: "not-observed",
              },
          ];
}
