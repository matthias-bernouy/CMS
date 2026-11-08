import { resolve } from "node:path";
import {
    FilesystemCollectionRepository,
    FilesystemProviderRepository,
    FilesystemRepositoryCatalogueIndex,
} from "@bernouy/repository/repository/filesystem";
import type { CollectionRepositorySource } from "@bernouy/repository/collections/sources";
import type { ProviderRepositorySource } from "@bernouy/repository/providers/sources";

export type OfficialBootstrapSources = Readonly<{
    providers: ProviderRepositorySource;
    collections: CollectionRepositorySource;
}>;

/** Image-owned immutable artifacts, independent of the user-configured public Repository. */
export function bundledBootstrapSources(
    root = resolve(import.meta.dir, "../../../../dist/bootstrap"),
): OfficialBootstrapSources {
    const index = new FilesystemRepositoryCatalogueIndex(root);
    return {
        providers: new FilesystemProviderRepository("ulvia-bundled", root, index),
        collections: new FilesystemCollectionRepository("ulvia-bundled", root, index),
    };
}
