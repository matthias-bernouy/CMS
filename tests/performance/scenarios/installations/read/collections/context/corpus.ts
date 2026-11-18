import { assertCondition } from "../../../../queries/types";
import type { CollectionReadState } from "./types";

/** History is real successive persisted upgrades, not version-like labels on unrelated resources. */
export async function prepareCollectionCorpus(state: CollectionReadState, profile: string) {
    const deadline = Date.now() + 240_000;
    const create = async (index: number, patch: number) => {
        assertCondition(Date.now() < deadline, "collection-read-corpus-deadline");
        const resource = await state.create(index, patch);
        await state.publish(resource);
        return resource;
    };
    if (profile === "large") {
        const rows = [];
        for (let index = 0; index < 64; index++) {
            rows.push(await create(index, 0));
        }
        await state.install(rows);
        for (let patch = 1; patch <= 32; patch++) {
            await state.upgrade(await create(0, patch));
        }
        return;
    }
    await state.install([await create(0, 0)]);
    if (profile === "history") {
        for (let patch = 1; patch <= 32; patch++) {
            await state.upgrade(await create(0, patch));
        }
    } else {
        assertCondition(profile === "invalidation", "collection-read-profile");
    }
}
