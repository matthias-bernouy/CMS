import type { ProviderInstanceRecord, InstanceTransitionRecord } from "@bernouy/ulvia-provider";
import type { RetentionRecords } from "../../../src/runtime/instances/system/retention/interfaces";

/** Small deterministic data source for the same streaming ports used by Mongo startup. */
export function retentionRecords(
    instances: readonly ProviderInstanceRecord[],
    transitions: readonly InstanceTransitionRecord[] = [],
): RetentionRecords {
    return {
        instances: (async function* () {
            yield* instances;
        })(),
        transitions: async function* (id?: string) {
            for (const value of transitions) {
                if (value.status !== "succeeded" && (id === undefined || value.instanceId === id)) {
                    yield value;
                }
            }
        },
        hasUnstagedUpgrade: async (id) =>
            transitions.some(
                (value) =>
                    value.instanceId === id &&
                    value.status !== "succeeded" &&
                    value.kind === "upgrade" &&
                    !value.completedSteps.includes("manifest"),
            ),
    };
}
