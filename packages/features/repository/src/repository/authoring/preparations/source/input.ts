import { AUTHORING_SOURCE_LIMITS } from "./limits";
import { isResourceId } from "@bernouy/ulvia-contracts/protocol";
import type { PublicationAsset } from "repository/repository/publication/types";
import { RepositoryRequestError } from "../../../core/errors";
import { parseSourceSnapshot } from "../../snapshot";

export function collectionBuildInput(sourceJson: string, supplied: readonly PublicationAsset[]) {
    let snapshot: ReturnType<typeof parseSourceSnapshot>;
    let definition: unknown;
    try {
        snapshot = parseSourceSnapshot(sourceJson);
        definition = JSON.parse(snapshot.files.find((file) => file.path === "definition.json")!.content);
    } catch {
        throw new RepositoryRequestError("REJECTED", "Invalid collection source snapshot or definition.json");
    }
    if (
        !definition ||
        typeof definition !== "object" ||
        Array.isArray(definition) ||
        !("collectionId" in definition) ||
        !isResourceId(definition.collectionId)
    ) {
        throw new RepositoryRequestError("REJECTED", "Invalid collection source ID");
    }
    const assets = supplied.map((asset) => ({
        id: asset.id,
        bytes: asset.bytes instanceof Blob ? asset.bytes : new Blob([asset.bytes.slice()]),
    }));
    if (
        assets.length !== snapshot.assets.length ||
        new Set(assets.map((asset) => asset.id)).size !== assets.length ||
        snapshot.assets.some((asset) => !assets.some((entry) => entry.id === asset.path.slice(7)))
    ) {
        throw new RepositoryRequestError("REJECTED", "Source asset bytes must match the snapshot exactly");
    }
    let total = 0;
    for (const asset of assets) {
        total += asset.bytes.size;
        if (asset.bytes.size > AUTHORING_SOURCE_LIMITS.assetBytes || total > AUTHORING_SOURCE_LIMITS.assetBundleBytes) {
            throw new RepositoryRequestError("REJECTED", "Collection source assets exceed the build limit");
        }
    }
    return { snapshot, collectionId: definition.collectionId, assets };
}
