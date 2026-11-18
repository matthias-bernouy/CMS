import { assertCondition } from "../../../queries/types";
import type { MetadataResources } from "./resources";
import type { MetadataConnections } from "./connections";

export async function initializeMetadataProfile(
    resources: MetadataResources,
    connections: MetadataConnections,
    profile: string,
) {
    assertCondition(["large", "history", "invalidation"].includes(profile), "metadata-profile");
    const deadline = Date.now() + 240_000;
    const pending = [];
    if (profile === "history") {
        for (let patch = 0; patch <= 32; patch++) {
            assertCondition(Date.now() < deadline, "metadata-history-preparation-deadline");
            await resources.contract(patch);
            pending.push(await resources.provider(0, patch));
        }
        pending.push(await resources.provider(1, 0));
    } else {
        await resources.contract(0, profile === "large");
        for (let index = 0; index < (profile === "large" ? 64 : 2); index++) {
            assertCondition(Date.now() < deadline, "metadata-large-preparation-deadline");
            pending.push(await resources.provider(index, 0));
        }
    }
    await connections.connect(pending);
    await connections.select();
    if (profile === "history") {
        for (let step = 0; step < 32; step++) {
            assertCondition(Date.now() < deadline, "metadata-history-status-deadline");
            await connections.toggle();
        }
    }
}
