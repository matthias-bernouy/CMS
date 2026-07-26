import type {
    IntegrationRegistryStablePromotionRecord,
    IntegrationRegistryStablePromotionResult,
} from "../../../../../interfaces/promotion";
import { removeFileIfExists, replaceCanonicalJson } from "../../persistence/canonicalFile";
import {
    createStablePromotionJournal,
    type FsIntegrationRegistryStablePromotionJournal,
    type FsIntegrationRegistryStablePromotionPhase,
    writeStablePromotionJournal,
} from "../journal";
import type { FsIntegrationRegistryStablePromotionPaths } from "../layout";
import { writeStablePromotionRecord } from "../document";
import {
    FsIntegrationRegistryStablePromotionRecoveryRequiredError,
    FsIntegrationRegistryStablePromotionSimulatedCrashError,
    type FsIntegrationRegistryStablePromoterConfig,
} from "../types";
import { rollbackStablePromotion, type StablePromotionMutationState } from "./lifecycle";
import { buildAndSwapStablePromotionSnapshot } from "./snapshot";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export async function commitFsIntegrationRegistryStablePromotion(
    input: Readonly<{
        config: FsIntegrationRegistryStablePromoterConfig;
        paths: FsIntegrationRegistryStablePromotionPaths;
        record: IntegrationRegistryStablePromotionRecord;
        previousIndex: FsIntegrationRegistryStablePromotionJournal["previousIndex"];
        nextIndex: FsIntegrationRegistryStablePromotionJournal["nextIndex"];
    }>,
): Promise<IntegrationRegistryStablePromotionResult> {
    const { config, paths, record, previousIndex, nextIndex } = input;
    let journal: FsIntegrationRegistryStablePromotionJournal = {
        schema: "cms.integration.registry.stable-promotion-journal.v1",
        operationId: record.operationId,
        phase: "prepared",
        createdAt: record.createdAt,
        record,
        previousIndex,
        nextIndex,
    };
    const state: StablePromotionMutationState = {
        journalCreated: false,
        indexWritten: false,
        recordWritten: false,
        snapshotSwapped: false,
    };
    try {
        await createStablePromotionJournal(paths.journal, journal);
        state.journalCreated = true;
        await notifyBoundary(config, journal);

        await replaceCanonicalJson(paths.index, nextIndex, MAX_INDEX_DOCUMENT_BYTES);
        state.indexWritten = true;
        journal = await advanceJournal(paths.journal, journal, "index-written");
        await notifyBoundary(config, journal);

        await writeStablePromotionRecord(paths.record, record);
        state.recordWritten = true;
        journal = await advanceJournal(paths.journal, journal, "record-written");
        await notifyBoundary(config, journal);

        const snapshot = await buildAndSwapStablePromotionSnapshot(config, paths, record);
        state.snapshotSwapped = true;
        journal = await advanceJournal(paths.journal, journal, "snapshot-swapped");
        await notifyBoundary(config, journal);
        await removeFileIfExists(paths.journal);
        return { operationId: record.operationId, record, snapshot };
    } catch (error) {
        if (error instanceof FsIntegrationRegistryStablePromotionSimulatedCrashError) {
            throw error;
        }
        if (state.snapshotSwapped) {
            throw new FsIntegrationRegistryStablePromotionRecoveryRequiredError(boundary(journal), error);
        }
        try {
            await rollbackStablePromotion(paths, previousIndex, state);
        } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], "Stable promotion and rollback failed");
        }
        throw error;
    }
}

async function advanceJournal(
    path: string,
    journal: FsIntegrationRegistryStablePromotionJournal,
    phase: FsIntegrationRegistryStablePromotionPhase,
): Promise<FsIntegrationRegistryStablePromotionJournal> {
    const next = { ...journal, phase };
    await writeStablePromotionJournal(path, next);
    return next;
}

async function notifyBoundary(
    config: FsIntegrationRegistryStablePromoterConfig,
    journal: FsIntegrationRegistryStablePromotionJournal,
): Promise<void> {
    try {
        await config.afterBoundary?.(boundary(journal));
    } catch (error) {
        throw new FsIntegrationRegistryStablePromotionSimulatedCrashError(boundary(journal), error);
    }
}

function boundary(journal: FsIntegrationRegistryStablePromotionJournal) {
    return {
        operationId: journal.operationId,
        promotionId: journal.record.id,
        phase: journal.phase,
        kind: journal.record.kind,
        version: journal.record.version,
        reportRevisionId: journal.record.reportRevisionId,
    } as const;
}
