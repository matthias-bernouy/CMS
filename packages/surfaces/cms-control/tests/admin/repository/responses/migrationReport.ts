export function migrationReportFixture() {
    return {
        migrationInputDigest: "e".repeat(64),
        source: { kind: "commerce", version: "1.1.0", packageDigest: "b".repeat(64) },
        target: { kind: "commerce", version: "1.2.0", packageDigest: "c".repeat(64) },
        connectorKey: "primary",
        lineageId: "commerce-main",
        sourceMigrationRevision: 4,
        targetMigrationRevision: 5,
        supportedSourceRange: "^1.1.0",
        result: {
            runnerDigest: "1".repeat(64),
            environmentDigest: "2".repeat(64),
            freshTarget: targetObservation(),
            migratedTarget: targetObservation(),
            equivalence: {
                ...observation("passed"),
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
                        checksum: `sha256:${"3".repeat(64)}`,
                        revision: 5,
                        attemptId: "attempt-1",
                    },
                ],
            },
            replay: {
                ...observation("passed"),
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
                    activePackageDigest: "c".repeat(64),
                    pointOfNoReturnCrossed: true,
                    cleanupObserved: true,
                },
            },
        },
    };
}

function targetObservation() {
    return {
        ...observation("passed"),
        stateDigest: "4".repeat(64),
        schemaDigest: "5".repeat(64),
        dataDigest: "6".repeat(64),
        functionDigests: [{ functionId: "cms-commerce", digest: "7".repeat(64) }],
        bindingDigest: "8".repeat(64),
    };
}

function observation(status: string) {
    return { status, evidenceDigests: [], diagnosticCodes: [] };
}
