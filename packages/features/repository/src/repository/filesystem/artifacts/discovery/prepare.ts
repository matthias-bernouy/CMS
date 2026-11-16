import type { RemoteCoordinate } from "repository/repository/publication/types";
import { LocalCollectionRepository } from "../collections";
import { LocalRepositoryYanks } from "../../yanks";
import { collectionReferences } from "./collectionReferences";
import { RecipeProjections } from "./projections";

/** Prepare a possible historical fallback before committing a yank; public reads never repair data. */
export async function prepareRecipeYank(root: string, coordinate: RemoteCoordinate, willYank: boolean) {
    if (coordinate.kind !== "collection") {
        return;
    }
    const withdrawn = new Set(
        (await new LocalRepositoryYanks(root).entries("collection")).map(({ coordinate }) => coordinate),
    );
    const key = `collection\0${coordinate.publisherId}\0${coordinate.id}\0${coordinate.version}`;
    if (willYank) {
        withdrawn.add(key);
    } else {
        withdrawn.delete(key);
    }
    const latest = (
        await collectionReferences(
            root,
            {
                publisherId: coordinate.publisherId,
                collectionId: coordinate.id,
                channel: "stable",
            },
            withdrawn,
        )
    ).at(-1);
    const projections = new RecipeProjections(root);
    if (!latest || (await projections.get(latest))) {
        return;
    }
    const metadata = await new LocalCollectionRepository(root).getMetadata(
        latest.publisherId,
        latest.collectionId,
        latest.version,
    );
    if (!metadata) {
        throw new Error("Published recipe fallback disappeared before yank");
    }
    await projections.put(metadata);
}
