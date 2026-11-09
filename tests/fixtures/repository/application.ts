import { ProviderOperationExecutor, MemoryProviderOperationStore } from "@bernouy/ulvia-provider";
import type { ProviderOperationStore } from "@bernouy/ulvia-provider";
import type { RepositoryPublicationRegistry } from "@bernouy/repository/repository/publication";
import { join } from "node:path";
import { InMemoryPatRepository } from "@bernouy/auth";
import {
    FilesystemRegistryReads,
    FilesystemRepositoryCatalogueIndex,
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
} from "@bernouy/repository/repository/filesystem";
import { RepositoryNamespaces } from "@bernouy/repository/repository/namespaces";
import { RepositoryCapabilityService } from "@bernouy/repository/repository/capabilities";
import { FilesystemRepositorySourceStore } from "@bernouy/repository/repository/sources";
import { RepositorySearch } from "@bernouy/repository/repository/search";
import { FilesystemRepositorySearchSource } from "@bernouy/repository/repository/search/filesystem";
import { FixtureNamespaceStore } from "./ownership";
import { repositoryFixtureHttp } from "./http";

/** Fast protocol fixture, not a replacement for the real Edge/Provider/Mongo acceptance journey. */
export function repositoryApplication(
    root: string,
    repositoryId = "fixture-repository",
    publicationRegistry?: RepositoryPublicationRegistry,
    operationStore: ProviderOperationStore = new MemoryProviderOperationStore(),
) {
    const operations = new ProviderOperationExecutor(operationStore);
    const accounts = new Set<string>();
    const pats = new InMemoryPatRepository();
    const namespaces = new RepositoryNamespaces(new FixtureNamespaceStore(join(root, ".ownership-fixture")), {
        exists: async (id) => accounts.has(id),
    });
    const index = new FilesystemRepositoryCatalogueIndex(root);
    const registry = publicationRegistry ?? new FilesystemRepositoryPublicationRegistry(root, index);
    const uploads = new FilesystemRepositoryPublicationUploadStore(root);
    const reads = new FilesystemRegistryReads(root, index);
    const search = new RepositorySearch(new FilesystemRepositorySearchSource(root, index));
    const service = new RepositoryCapabilityService({
        repositoryId,
        namespaces,
        registry,
        uploads,
        search,
        sources: new FilesystemRepositorySourceStore(root),
        catalogue: (input) => reads.catalogue(input),
        release: (coordinate) => reads.release(coordinate),
        asset: (coordinate, id) => reads.asset(coordinate, id),
    });
    const ready = repositoryFixtureHttp(
        service,
        async (token) => {
            const principal = await pats.verify(token);
            return principal && accounts.has(principal.sub) ? principal.sub : null;
        },
        operations,
    );
    return {
        operations,
        index,
        handle: async (request: Request) => (await ready)(request),
        service,
        namespaces,
        repositoryId,
        accounts,
        pats,
        registry,
        uploads,
        async account(accountId = "fixture-owner") {
            accounts.add(accountId);
            const { token, pat } = await pats.create({ sub: accountId, name: "Repository fixture" });
            return { accountId, token, patId: pat.id };
        },
        close: async () => {
            await operations.stop();
            try {
                await search.close();
            } finally {
                await uploads.close();
            }
        },
    };
}
