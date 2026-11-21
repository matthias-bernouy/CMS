import { requiredVariants } from "../../../capabilities/policies";
import { lifecycleScenarios } from "../../lifecycle";
import { prepareClusterRead } from "./recipe";
import type { CapabilityInventory } from "../../../capabilities/types";

export function clusterLogScenarios(inventory: CapabilityInventory, fixture: string) {
    return ["logs.query", "logs.get", "logs.aggregate", "latency.query"].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) =>
                !row.retained && row.release.contractId === "ulvia/cluster.logs" && row.definition.id === capability,
        );
        if (!target) {
            throw new Error("Cluster log performance inventory is stale");
        }
        return lifecycleScenarios(
            inventory,
            fixture,
            "cluster-logs",
            "ulvia/cluster.logs",
            [capability],
            (environment, id, obligation) => prepareClusterRead(inventory, environment, id, obligation.variant),
            requiredVariants(target),
            1,
            4,
        );
    });
}
