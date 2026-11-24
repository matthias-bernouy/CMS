import { lifecycleScenarios } from "../lifecycle";
import { requiredVariants } from "../../capabilities/policies";
import { freshTenants } from "../installations/fresh";
import { workflowContext, WORKFLOWS } from "./context";
import { prepareWorkflow } from "./prepare";
import { prepareDomain, EVENTS } from "./domain";
import type { CapabilityInventory } from "../../capabilities/types";
export function workflowScenarios(inventory: CapabilityInventory, fixture: string) {
    const fresh = freshTenants(inventory);
    return inventory.targets
        .filter((target) => !target.retained && [WORKFLOWS, EVENTS].includes(target.release.contractId))
        .flatMap((target) =>
            lifecycleScenarios(
                inventory,
                fixture,
                target.release.contractId === EVENTS ? "domain-events" : "workflows",
                target.release.contractId,
                [target.definition.id],
                async (environment, capability, obligation) => {
                    const tenant = await fresh(environment, obligation.binding, false);
                    try {
                        const context = await workflowContext(inventory, environment, tenant);
                        return target.release.contractId === EVENTS
                            ? await prepareDomain(context, capability, obligation.binding, obligation.variant)
                            : await prepareWorkflow(context, capability, obligation.binding, obligation.variant);
                    } catch (error) {
                        await tenant.close();
                        throw error;
                    }
                },
                requiredVariants(target),
            ),
        );
}
