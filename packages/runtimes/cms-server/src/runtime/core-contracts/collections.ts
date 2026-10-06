import type { CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { CoreStores } from "../stores/core";

export function registerCollectionCapabilities(dispatcher: CoreCapabilityRegistry, core: CoreStores): void {
    dispatcher.register("ulvia.cms.collections", "list", async () => {
        const snapshot = await core.collections.snapshot("default");
        return {
            revision: snapshot.revision,
            items: snapshot.collections.map(({ release, ...installation }) => ({
                collectionId: installation.collectionId,
                publisherId: release.publisherId,
                version: release.version,
                digest: installation.digest,
                ...(installation.repositoryId ? { repositoryId: installation.repositoryId } : {}),
                dataGeneration: release.dataGeneration ?? 1,
                blocCount: release.blocs.length,
                pageCount: release.pages?.length ?? 0,
                assetCount: release.assets.length,
                textCount: release.texts?.length ?? 0,
                themeTokenCount:
                    release.theme?.categories.reduce((total, category) => total + category.tokens.length, 0) ?? 0,
            })),
        };
    });
}
