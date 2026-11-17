import type { ContractSelectionStore } from "@bernouy/repository/providers/selections";
import type { ReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { selectedCapabilityResolver, selectedPublicSvgCapabilityValidator } from "../../selections/capabilities";

/** One disposable preview only. The initialization service brackets it with fresh execution checks. */
export function previewCapabilities(selections: ContractSelectionStore, releases: ReleaseCatalogue) {
    let selection: ReturnType<ContractSelectionStore["get"]> | undefined;
    const contracts = new Map<string, ReturnType<ReleaseCatalogue["get"]>>();
    const current: Pick<ContractSelectionStore, "get"> = {
        get: async (siteId) => {
            if (siteId !== "default") {
                throw new Error("Initialization preview selection scope mismatch");
            }
            selection ??= selections.get(siteId);
            try {
                return await selection;
            } catch (error) {
                selection = undefined;
                throw error;
            }
        },
    };
    const catalogue: Pick<ReleaseCatalogue, "get"> = {
        get: async (id, version) => {
            const key = JSON.stringify([id, version]);
            const cached = contracts.get(key);
            if (cached) {
                return cached;
            }
            const pending = releases.get(id, version);
            // Production preparation already bounds selections to 64 exact contracts.
            if (contracts.size < 64) {
                contracts.set(key, pending);
            }
            try {
                const record = await pending;
                if (!record) {
                    contracts.delete(key);
                }
                return record;
            } catch (error) {
                contracts.delete(key);
                throw error;
            }
        },
    };
    return {
        resolveCapabilities: selectedCapabilityResolver("default", current, catalogue),
        validateSvgCapabilities: selectedPublicSvgCapabilityValidator("default", current, catalogue),
    };
}
