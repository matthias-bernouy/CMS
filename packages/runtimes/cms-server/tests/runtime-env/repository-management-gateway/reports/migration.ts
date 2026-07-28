import { TEST_DIGEST, TEST_KIND, TEST_VERSION } from "./compatibility";

export function candidateMigration() {
    return {
        migrationInputDigest: "2".repeat(64),
        source: { kind: TEST_KIND, version: "1.1.0", packageDigest: "d".repeat(64) },
        target: { kind: TEST_KIND, version: TEST_VERSION, packageDigest: TEST_DIGEST },
        connectorKey: "primary",
        lineageId: "commerce-main",
        sourceMigrationRevision: 4,
        targetMigrationRevision: 5,
        supportedSourceRange: "^1.1.0",
        result: {
            runnerDigest: "3".repeat(64),
            environmentDigest: "4".repeat(64),
            freshTarget: targetObservation("5"),
            migratedTarget: targetObservation("5"),
            equivalence: {
                ...observation("passed"),
                freshStateDigest: "5".repeat(64),
                migratedStateDigest: "5".repeat(64),
                equivalent: true,
                differences: [],
            },
            ledger: {
                ...observation("passed"),
                sourceRevision: 4,
                targetRevision: 5,
                freshBaselineRecorded: true,
                migrationAndLedgerAtomic: true,
                checksumMismatchRejected: true,
                emptyLedgerRejected: true,
                rows: [
                    {
                        migrationId: "0005-orders",
                        checksum: `sha256:${"6".repeat(64)}`,
                        revision: 5,
                        attemptId: "attempt-1",
                        sourcePackageDigest: "d".repeat(64),
                        targetPackageDigest: TEST_DIGEST,
                    },
                ],
            },
            replay: {
                ...observation("passed"),
                firstStateDigest: "5".repeat(64),
                replayStateDigest: "5".repeat(64),
                unchanged: true,
                ledgerRowsBefore: 1,
                ledgerRowsAfterFirstRun: 2,
                ledgerRowsAfterReplay: 2,
            },
            cutover: {
                cmsMediated: {
                    ...observation("passed"),
                    strategy: "binding-switch",
                    bindingRevisionBefore: "binding-4",
                    bindingRevisionAfter: "binding-5",
                },
                providerDirect: {
                    ...observation("not-applicable"),
                    strategy: "not-applicable",
                    callbackIds: [],
                },
                activation: {
                    ...observation("passed"),
                    activePackageDigest: TEST_DIGEST,
                    activeBindingDigest: "7".repeat(64),
                    pointOfNoReturnCrossed: true,
                    cleanupObserved: true,
                },
            },
        },
    };
}

function targetObservation(seed: string) {
    return {
        ...observation("passed"),
        stateDigest: seed.repeat(64),
        schemaDigest: "8".repeat(64),
        dataDigest: "9".repeat(64),
        functionDigests: [{ functionId: "cms-commerce", digest: "a".repeat(64) }],
        bindingDigest: "7".repeat(64),
    };
}

function observation(status: string) {
    return { status, evidenceDigests: [], diagnosticCodes: [] };
}
