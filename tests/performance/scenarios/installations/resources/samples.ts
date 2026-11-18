import { collectionResources } from "./index";
import { assertCondition } from "../../queries/types";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export function sampleResourceIdentity(scenario: string, sampleIndex: number) {
    assertCondition(scenario.length > 0 && scenario.length < 200);
    assertCondition(Number.isSafeInteger(sampleIndex) && sampleIndex >= 0 && sampleIndex < 256);
    return { bucket: `${scenario}:${Math.floor(sampleIndex / 16)}`, name: `${scenario}-${sampleIndex}` };
}

/** Distinct immutable artifacts permit sequential tenant reuse; each publisher has at most 32 versioned releases. */
export function sampleCollectionResources(inventory: CapabilityInventory) {
    const publishers = new Map<string, ReturnType<typeof collectionResources>>();
    return (environment: QueryEnvironment, scenario: string, sampleIndex: number, version = "1.0.0") => {
        const identity = sampleResourceIdentity(scenario, sampleIndex);
        let resources = publishers.get(identity.bucket);
        if (!resources) {
            assertCondition(publishers.size < 64);
            resources = collectionResources(inventory);
            publishers.set(identity.bucket, resources);
        }
        return resources(environment, identity.name, version);
    };
}
