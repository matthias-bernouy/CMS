import {
    type FsIntegrationVerificationBackfillJournal,
    type FsIntegrationVerificationBackfillPhase,
    FS_INTEGRATION_VERIFICATION_BACKFILL_PHASES,
    writeIntegrationVerificationBackfillJournal,
} from "../document";
import type { FsIntegrationVerificationBackfillerConfig } from "../types";
import { FsIntegrationVerificationBackfillSimulatedCrashError } from "../types";

export async function advanceIntegrationVerificationBackfill(
    config: FsIntegrationVerificationBackfillerConfig,
    path: string,
    journal: FsIntegrationVerificationBackfillJournal,
    phase: FsIntegrationVerificationBackfillPhase,
): Promise<FsIntegrationVerificationBackfillJournal> {
    if (phaseIndex(journal.phase) >= phaseIndex(phase)) {
        return journal;
    }
    const next = { ...journal, phase };
    await writeIntegrationVerificationBackfillJournal(path, next);
    await notifyIntegrationVerificationBackfillBoundary(config, next);
    return next;
}

export async function notifyIntegrationVerificationBackfillBoundary(
    config: FsIntegrationVerificationBackfillerConfig,
    journal: FsIntegrationVerificationBackfillJournal,
): Promise<void> {
    const target = journal.request.verification.envelope.target;
    const boundary = {
        operationId: journal.operationId,
        phase: journal.phase,
        kind: target.kind,
        version: target.version,
        packageDigest: target.packageDigest,
        verificationDigest: journal.request.verification.digest,
    } as const;
    try {
        await config.afterBoundary?.(boundary);
    } catch (error) {
        throw new FsIntegrationVerificationBackfillSimulatedCrashError(boundary, error);
    }
}

function phaseIndex(phase: FsIntegrationVerificationBackfillPhase): number {
    return FS_INTEGRATION_VERIFICATION_BACKFILL_PHASES.indexOf(phase);
}
