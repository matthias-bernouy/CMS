import { parseSourceSnapshot } from "../authoring/snapshot";
import { RepositoryRequestError } from "../core/errors";
import type { PublicationAsset } from "./types";

/** Text-authored assets are already in sourceJson; only resolve separate binary references. */
export function collectionSourceAssets(
    sourceJson: string,
    supplied: readonly PublicationAsset[],
): readonly PublicationAsset[] {
    let snapshot: ReturnType<typeof parseSourceSnapshot>;
    try {
        snapshot = parseSourceSnapshot(sourceJson);
    } catch {
        throw new RepositoryRequestError("REJECTED", "Invalid collection source snapshot");
    }
    const assets = new Map(supplied.map((asset) => [asset.id, asset]));
    if (assets.size !== supplied.length) {
        throw new RepositoryRequestError("REJECTED", "Collection asset IDs must be unique");
    }
    return snapshot.assets.map(({ path }) => {
        const asset = assets.get(path.slice(7));
        if (!asset) {
            throw new RepositoryRequestError("REJECTED", "Source asset bytes are missing");
        }
        return asset;
    });
}
