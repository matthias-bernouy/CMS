import type {
    MigrationCutoverObservationV1,
    MigrationEquivalenceObservationV1,
    MigrationLedgerObservationV1,
    MigrationReplayObservationV1,
    MigrationTargetObservationV1,
} from "@bernouy/cms-integration-verification";

export function projectTargetObservation(observation: MigrationTargetObservationV1) {
    return {
        ...baseObservation(observation),
        ...(observation.stateDigest ? { stateDigest: observation.stateDigest } : {}),
        ...(observation.schemaDigest ? { schemaDigest: observation.schemaDigest } : {}),
        ...(observation.dataDigest ? { dataDigest: observation.dataDigest } : {}),
        functionDigests: observation.functionDigests.map(({ functionId, digest }) => ({ functionId, digest })),
        ...(observation.bindingDigest ? { bindingDigest: observation.bindingDigest } : {}),
    };
}

export function projectEquivalenceObservation(observation: MigrationEquivalenceObservationV1) {
    return {
        ...baseObservation(observation),
        ...(observation.freshStateDigest ? { freshStateDigest: observation.freshStateDigest } : {}),
        ...(observation.migratedStateDigest ? { migratedStateDigest: observation.migratedStateDigest } : {}),
        ...(observation.equivalent === undefined ? {} : { equivalent: observation.equivalent }),
        differences: observation.differences.map((difference) => ({
            surface: difference.surface,
            path: difference.path,
            ...(difference.freshDigest ? { freshDigest: difference.freshDigest } : {}),
            ...(difference.migratedDigest ? { migratedDigest: difference.migratedDigest } : {}),
        })),
    };
}

export function projectLedgerObservation(observation: MigrationLedgerObservationV1) {
    return {
        ...baseObservation(observation),
        ...(observation.sourceRevision === undefined ? {} : { sourceRevision: observation.sourceRevision }),
        ...(observation.targetRevision === undefined ? {} : { targetRevision: observation.targetRevision }),
        ...(observation.freshBaselineRecorded === undefined
            ? {}
            : { freshBaselineRecorded: observation.freshBaselineRecorded }),
        ...(observation.migrationAndLedgerAtomic === undefined
            ? {}
            : { migrationAndLedgerAtomic: observation.migrationAndLedgerAtomic }),
        ...(observation.checksumMismatchRejected === undefined
            ? {}
            : { checksumMismatchRejected: observation.checksumMismatchRejected }),
        ...(observation.emptyLedgerRejected === undefined
            ? {}
            : { emptyLedgerRejected: observation.emptyLedgerRejected }),
        rows: observation.rows.map((row) => ({
            migrationId: row.migrationId,
            checksum: row.checksum,
            revision: row.revision,
            attemptId: row.attemptId,
            ...(row.sourcePackageDigest ? { sourcePackageDigest: row.sourcePackageDigest } : {}),
            ...(row.targetPackageDigest ? { targetPackageDigest: row.targetPackageDigest } : {}),
        })),
    };
}

export function projectReplayObservation(observation: MigrationReplayObservationV1) {
    return {
        ...baseObservation(observation),
        ...(observation.firstStateDigest ? { firstStateDigest: observation.firstStateDigest } : {}),
        ...(observation.replayStateDigest ? { replayStateDigest: observation.replayStateDigest } : {}),
        ...(observation.unchanged === undefined ? {} : { unchanged: observation.unchanged }),
        ...(observation.ledgerRowsBefore === undefined ? {} : { ledgerRowsBefore: observation.ledgerRowsBefore }),
        ...(observation.ledgerRowsAfterFirstRun === undefined
            ? {}
            : { ledgerRowsAfterFirstRun: observation.ledgerRowsAfterFirstRun }),
        ...(observation.ledgerRowsAfterReplay === undefined
            ? {}
            : { ledgerRowsAfterReplay: observation.ledgerRowsAfterReplay }),
    };
}

export function projectCutoverObservation(observation: MigrationCutoverObservationV1) {
    return {
        cmsMediated: {
            ...baseObservation(observation.cmsMediated),
            strategy: observation.cmsMediated.strategy,
            ...(observation.cmsMediated.bindingRevisionBefore
                ? { bindingRevisionBefore: observation.cmsMediated.bindingRevisionBefore }
                : {}),
            ...(observation.cmsMediated.bindingRevisionAfter
                ? { bindingRevisionAfter: observation.cmsMediated.bindingRevisionAfter }
                : {}),
        },
        providerDirect: {
            ...baseObservation(observation.providerDirect),
            strategy: observation.providerDirect.strategy,
            callbackIds: [...observation.providerDirect.callbackIds],
            ...(observation.providerDirect.signingSecretContinuityObserved === undefined
                ? {}
                : { signingSecretContinuityObserved: observation.providerDirect.signingSecretContinuityObserved }),
            ...(observation.providerDirect.providerStateDigest
                ? { providerStateDigest: observation.providerDirect.providerStateDigest }
                : {}),
        },
        activation: {
            ...baseObservation(observation.activation),
            ...(observation.activation.activePackageDigest
                ? { activePackageDigest: observation.activation.activePackageDigest }
                : {}),
            ...(observation.activation.activeBindingDigest
                ? { activeBindingDigest: observation.activation.activeBindingDigest }
                : {}),
            ...(observation.activation.pointOfNoReturnCrossed === undefined
                ? {}
                : { pointOfNoReturnCrossed: observation.activation.pointOfNoReturnCrossed }),
            ...(observation.activation.cleanupObserved === undefined
                ? {}
                : { cleanupObserved: observation.activation.cleanupObserved }),
        },
    };
}

function baseObservation(observation: {
    status: string;
    evidenceDigests: readonly string[];
    diagnosticCodes: readonly string[];
}) {
    return {
        status: observation.status,
        evidenceDigests: [...observation.evidenceDigests],
        diagnosticCodes: [...observation.diagnosticCodes],
    };
}
