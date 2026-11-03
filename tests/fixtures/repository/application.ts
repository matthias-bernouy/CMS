import type { RepositoryPublicationRegistry } from "@bernouy/cms-repository/repository/publication";
import { join } from "node:path";
import { InMemoryPatRepository } from "@bernouy/cms-auth";
import {
    FilesystemRegistryReads,
    FilesystemRepositoryCatalogueIndex,
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryNamespaces } from "@bernouy/cms-repository/repository/namespaces";
import { RepositoryCapabilityService } from "@bernouy/cms-repository/repository/capabilities";
import { FilesystemRepositorySourceStore } from "@bernouy/cms-repository/repository/sources";
import { RepositorySearch } from "@bernouy/cms-repository/repository/search";
import { FilesystemRepositorySearchSource } from "@bernouy/cms-repository/repository/search/filesystem";
import { FixtureNamespaceStore } from "./ownership";
import { repositoryFixtureHttp } from "./http";

/** Fast protocol fixture, not a replacement for the real Edge/Provider/Mongo acceptance journey. */
export function repositoryApplication(
    root: string,
    repositoryId = "fixture-repository",
    publicationRegistry?: RepositoryPublicationRegistry,
) {
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
    const handle = repositoryFixtureHttp(service, async (token) => {
        const principal = await pats.verify(token);
        return principal && accounts.has(principal.sub) ? principal.sub : null;
    });
    return {
        index,
        handle,
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
        close: () => search.close(),
    };
}
