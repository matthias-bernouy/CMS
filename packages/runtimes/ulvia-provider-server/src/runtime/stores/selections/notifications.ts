import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { StoredContractSelections } from "@bernouy/ulvia-providers/selections";
import type { Logger } from "@bernouy/logging";

/** Notify only after a validated CAS commit; optional observers cannot fail the committed operation. */
export function observeSelectionCommits(
    store: ContractSelectionStore,
    logger: Logger,
    committed?: (state: StoredContractSelections) => void,
): ContractSelectionStore {
    return {
        get: (siteId) => store.get(siteId),
        replace: async (...args) => {
            const state = await store.replace(...args);
            try {
                void Promise.resolve(committed?.(state)).catch((error) =>
                    logger.warn("provider.selection.notification.failed", {}, error),
                );
            } catch (error) {
                logger.warn("provider.selection.notification.failed", {}, error);
            }
            return state;
        },
    };
}
