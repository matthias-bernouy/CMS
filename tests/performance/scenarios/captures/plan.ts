import { lifecycleScenarios } from "../lifecycle";
import { requiredVariants } from "../../capabilities/policies";
import { prepareCaptureSample } from "./recipe";
import type { CapabilityInventory } from "../../capabilities/types";

/** Real capture paths have explicit worker latency/throughput ceilings, declared before measurement. */
export function captureScenarios(inventory: CapabilityInventory, fixture: string, contractId: string) {
    const ids =
        contractId === "ulvia/cms.content"
            ? ["pages.capture", "examples.capture", "captures.image"]
            : ["capture-prepared-example"];
    return ids.flatMap((id) => {
        const target = inventory.targets.find(
            (entry) => !entry.retained && entry.release.contractId === contractId && entry.definition.id === id,
        )!;
        return lifecycleScenarios(
            inventory,
            fixture,
            "visual-capture",
            contractId,
            [id],
            (environment, capability, obligation) =>
                prepareCaptureSample(inventory, environment, contractId, capability, obligation),
            requiredVariants(target),
        ).map((scenario) => ({
            ...scenario,
            definition: {
                ...scenario.definition,
                budget: {
                    ...scenario.definition.budget,
                    latencyMs: id === "captures.image" ? 2000 : 20_000,
                    responseBytes: 6 * 1024 * 1024,
                },
                ...(scenario.definition.load
                    ? {
                          load: {
                              concurrency: id === "captures.image" ? 10 : 2,
                              minimumRequestsPerMinute: id === "captures.image" ? 200 : 10,
                          },
                      }
                    : {}),
            },
        }));
    });
}
