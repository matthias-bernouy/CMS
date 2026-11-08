import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import type { CollectionReleaseSummary } from "../interfaces/store";

export function collectionReleaseSummary(digest: string, release: CollectionRelease): CollectionReleaseSummary {
    return {
        digest,
        publisherId: release.publisherId,
        collectionId: release.collectionId,
        version: release.version,
        blocCount: release.blocs.length,
        exampleCount: release.examples?.length ?? 0,
        assetCount: release.assets.length,
        textCount: release.texts?.length ?? 0,
        themeTokenCount:
            release.theme?.categories.reduce(
                (sum, category) => sum + category.entries.filter((entry) => entry.type !== "font-face").length,
                0,
            ) ?? 0,
        configurable: release.configuration !== undefined,
    };
}
