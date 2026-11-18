import { lifecycleScenarios } from "../lifecycle";
import { readerContext } from "./context";
import { prepareDocumentReader } from "./documents";
import { prepareCollectionReader } from "./collections";
import { prepareProviderReader } from "./providers";
import type { CapabilityInventory } from "../../capabilities/types";

const READERS = [
    "documentation.get",
    "repository.get",
    "get-collection-release",
    "list-collection-releases",
    "get-provider-installation",
    "get-provider-access",
] as const;

/** Baseline variants only; absent large/history/invalidation cases remain explicit coverage gaps. */
export function readerScenarios(inventory: CapabilityInventory, fixture: string) {
    return lifecycleScenarios(
        inventory,
        fixture,
        "installation-readers",
        "ulvia/cms.installations",
        READERS,
        (environment, capability, obligation) => {
            const context = readerContext(inventory, environment);
            if (capability === "documentation.get") {
                return prepareDocumentReader(context, obligation.binding);
            }
            if (capability.startsWith("get-provider-")) {
                return prepareProviderReader(context, capability, obligation.binding);
            }
            return prepareCollectionReader(context, capability, obligation.binding);
        },
    );
}
