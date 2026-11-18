import { collectionReadContexts } from "../collections/context";
import { assertCondition } from "../../../queries/types";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { CollectionReadState } from "../collections/context/types";

/** Discovery needs public version history, not installed Blocs: keep the workload explicit and avoid unrelated installation cost. */
export async function prepareDiscoveryCorpus(state: CollectionReadState, profile: string) {
    const deadline = Date.now() + 180_000;
    const count = profile === "large" ? 64 : profile === "history" ? 33 : 1;
    assertCondition(["large", "history", "invalidation"].includes(profile), "site-discovery-profile");
    for (let index = 0; index < count; index++) {
        assertCondition(Date.now() < deadline, "site-discovery-preparation-deadline");
        const resource = await state.create(profile === "large" ? index : 0, profile === "history" ? index : 0);
        await state.publish(resource);
    }
    assertCondition(state.installed.size === 0, "site-discovery-no-unrelated-installations");
}

export function siteDiscoveryContexts(inventory: CapabilityInventory) {
    return collectionReadContexts(inventory, prepareDiscoveryCorpus);
}
