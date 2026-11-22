import { lifecycleScenarios } from "../lifecycle";
import { requiredVariants } from "../../capabilities/policies";
import { freshTenants } from "../installations/fresh";
import { prepareForms } from "./prepare";
import type { CapabilityInventory } from "../../capabilities/types";
const capabilities = [
    "forms.create",
    "forms.get",
    "forms.list",
    "forms.update-draft",
    "forms.publish",
    "forms.set-availability",
    "forms.archive",
    "forms.get-public-definition",
    "forms.submit",
    "forms.submit-authenticated",
    "submissions.get",
    "submissions.list",
    "submissions.set-status",
    "submissions.retry-notification",
    "submissions.delete",
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
