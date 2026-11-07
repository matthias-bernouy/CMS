import type { CollectionVerifier } from "@bernouy/cms-repository/collections/sources";
import type { Embeddings, VectorStore } from "@bernouy/text-search";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
    RepositoryCapabilityService,
    RepositoryCapabilityError,
} from "@bernouy/cms-repository/repository/capabilities";
import { RepositoryNamespaces } from "@bernouy/cms-repository/repository/namespaces";
import { MongoRepositoryNamespaces } from "@bernouy/cms-repository/repository/namespaces/mongo";
import {
    FilesystemRegistryReads,
    FilesystemRepositoryCatalogueIndex,
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
    recoverRepositoryStorage,
    withRepositoryWriteLock,
} from "@bernouy/cms-repository/repository/filesystem";
import { FilesystemRepositorySourceStore } from "@bernouy/cms-repository/repository/sources";
import { RepositorySearch } from "@bernouy/cms-repository/repository/search";
import { FilesystemRepositorySearchSource } from "@bernouy/cms-repository/repository/search/filesystem";
import { ProviderCapabilityDispatchError } from "@bernouy/ulvia-provider";
import type { ProviderStores } from "../providerStores";

/** One explicitly enabled registry, isolated by the Provider instance's database and files. */
export async function createInstanceRepository(
    stores: Pick<ProviderStores, "db" | "users">,
    filesDirectory: string,
    instanceId: string,
    model: Embeddings,
    vectors: VectorStore,
    verifier?: CollectionVerifier,
) {
    const root = join(filesDirectory, "repository");
    await recoverRepositoryStorage(root);
    const namespaceStore = new MongoRepositoryNamespaces(stores.db, {
        exclusive: (key, operation) =>
            withRepositoryWriteLock(
                join(root, ".ownership-locks", createHash("sha256").update(key).digest("hex")),
                operation,
            ),
    });
    await namespaceStore.init();
    const namespaces = new RepositoryNamespaces(namespaceStore, {
        exists: async (accountId) => Boolean(await stores.users.getBySub(accountId)),
    });
    const index = new FilesystemRepositoryCatalogueIndex(root, verifier);
    const reads = new FilesystemRegistryReads(root, index, verifier);
    const uploads = new FilesystemRepositoryPublicationUploadStore(root);
    try {
        await uploads.recover();
    } catch (error) {
        await uploads.close();
        throw error;
    }
    const search = new RepositorySearch(new FilesystemRepositorySearchSource(root, index), model, vectors);
    const service = new RepositoryCapabilityService({
        repositoryId: instanceId,
        namespaces,
        uploads,
        search,
        sources: new FilesystemRepositorySourceStore(root),
        registry: new FilesystemRepositoryPublicationRegistry(root, index),
        catalogue: (input, signal) => reads.catalogue(input, signal),
        release: (coordinate) => reads.release(coordinate),
        asset: (coordinate, assetId) => reads.asset(coordinate, assetId),
    });
    return {
        service,
        namespaces,
        close: async () => {
            try {
                await search.close();
            } finally {
                await uploads.close();
            }
        },
        async withUserDeletion(sub: string, deletion: () => Promise<void>) {
            try {
                await namespaces.withoutOwnedNamespaces(sub, deletion);
            } catch (error) {
                if (error instanceof RepositoryCapabilityError) {
                    throw new ProviderCapabilityDispatchError("PROTECTED_USER", 409);
                }
                throw error;
            }
        },
    };
}
