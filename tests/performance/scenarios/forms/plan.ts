import { lifecycleScenarios } from "../lifecycle";
import { requiredVariants } from "../../capabilities/policies";
import { freshTenants } from "../installations/fresh";
import { prepareForms } from "./prepare";
import type { CapabilityInventory } from "../../capabilities/types";
const capabilities = [
    "forms.create-v2",
    "forms.describe-submission",
    "forms.list-submission-sources",
    "forms.get-v2",
    "forms.list-v2",
    "forms.update-draft-v2",
    "forms.publish-v2",
    "forms.set-availability-v2",
    "forms.archive-v2",
    "forms.get-public-definition-v2",
    "forms.submit-v2",
    "forms.submit-authenticated-v2",
    "submissions.get-v2",
    "submissions.list-v2",
    "submissions.set-status-v2",
    "submissions.delete-v2",
];
export function formsScenarios(inventory: CapabilityInventory, fixture: string) {
    const fresh = freshTenants(inventory);
    return [
        ...capabilities.map((capability) => ({ contract: "ulvia/cms.forms", capability })),
        { contract: "ulvia/cms.installations", capability: "select-contract" },
    ].flatMap(({ contract, capability }) => {
        const target = inventory.targets.find(
            (item) => !item.retained && item.release.contractId === contract && item.definition.id === capability,
        );
        if (!target) {
            throw new Error("Forms scenario inventory is stale");
        }
        return lifecycleScenarios(
            inventory,
            fixture,
            "forms",
            contract,
            [capability],
            async (environment, id, obligation) =>
                prepareForms(
                    inventory,
                    await fresh(environment, "http", false),
                    environment,
                    id,
                    obligation.binding,
                    obligation.variant,
                ),
            requiredVariants(target),
        );
    });
}
