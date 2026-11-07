import { selectionAuthority } from "../authority/inventory";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS } from "ulvia-providers/installations/core/limits";
import type {
    ContractSelectionContext,
    ContractSelectionPlan,
} from "ulvia-providers/selections/interfaces/ContractSelectionPlan";
import { selectionDependencies, validateSelectionGraph } from "./dependencyGraph";
import { ContractSelectionValidationError, translateSelectionError } from "../errors";
import {
    DEFAULT_CONTRACT_SELECTION_LIMITS,
    type ContractSelectionLimits,
    selectionLimits,
} from "ulvia-providers/selections/core/limits";
import {
    parseContractSelections,
    parseSelectionSiteId,
} from "ulvia-providers/selections/core/graph/parseContractSelections";
import { resolveSelections, snapshotInstallations } from "./resolveSelections";

/** Checks the caller's complete site graph without solving, switching installations or upgrading versions. */
export async function planContractSelections(
    siteId: string,
    value: unknown,
    context: ContractSelectionContext,
    limits: Readonly<ContractSelectionLimits> = DEFAULT_CONTRACT_SELECTION_LIMITS,
): Promise<ContractSelectionPlan> {
    const bounds = selectionLimits(limits);
    const site = parseSelectionSiteId(siteId);
    const selections = parseContractSelections(value, bounds);
    try {
        for (const selection of selections) {
            if (selection.siteId !== site) {
                throw new ContractSelectionValidationError(
                    "cross_site_selection",
                    "all selections must belong to the requested site",
                );
            }
        }
        // Clone synchronously before the first await; never freeze the caller's installation objects.
        const configured = context.installationLimits ?? DEFAULT_PROVIDER_INSTALLATION_LIMITS;
        const installationLimits = Object.freeze({
            maxDocumentBytes: configured.maxDocumentBytes,
            maxJsonDepth: configured.maxJsonDepth,
            maxImplementations: configured.maxImplementations,
        });
        if (Object.values(installationLimits).some((value) => !Number.isSafeInteger(value) || value <= 0)) {
            throw new TypeError("Provider installation limits must be positive safe integers");
        }
        const snapshot = { ...context, installationLimits };
        const installations = snapshotInstallations(context.installations, bounds, installationLimits);
        const resolved = await resolveSelections(selections, snapshot, installations);
        const dependencies = selectionDependencies(resolved, bounds.maxDependencies);
        validateSelectionGraph(resolved, dependencies);
        return deepFreeze({
            siteId: site,
            selections,
            dependencies,
            authority: selectionAuthority(resolved),
            structurallyValid: true,
            runtimeReadiness: "not-evaluated",
        });
    } catch (error) {
        return translateSelectionError(error);
    }
}
