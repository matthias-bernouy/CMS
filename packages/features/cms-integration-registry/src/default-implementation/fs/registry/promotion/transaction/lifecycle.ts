import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { removeFileIfExists, replaceCanonicalJson } from "../../persistence/canonicalFile";
import type { FsIntegrationRegistryStablePromotionPaths } from "../layout";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export type StablePromotionMutationState = {
    journalCreated: boolean;
    indexWritten: boolean;
    recordWritten: boolean;
    snapshotSwapped: boolean;
};

export async function rollbackStablePromotion(
    paths: FsIntegrationRegistryStablePromotionPaths,
    previousIndex: IntegrationDefinitionIndex,
    state: StablePromotionMutationState,
): Promise<void> {
    const failures: unknown[] = [];
    if (state.indexWritten) {
        await captureFailure(failures, replaceCanonicalJson(paths.index, previousIndex, MAX_INDEX_DOCUMENT_BYTES));
    }
    if (state.recordWritten) {
        await captureFailure(failures, removeFileIfExists(paths.record));
    }
    if (state.journalCreated) {
        await captureFailure(failures, removeFileIfExists(paths.journal));
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, "Integration registry stable promotion rollback failed");
    }
}

async function captureFailure(failures: unknown[], operation: Promise<void>): Promise<void> {
    try {
        await operation;
    } catch (error) {
        failures.push(error);
    }
}
