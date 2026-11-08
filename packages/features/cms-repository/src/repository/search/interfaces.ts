import type { CatalogueSearchInput } from "cms-repository/application/registry/interfaces/inputs";
import type { CatalogueSearchOutput } from "cms-repository/application/registry/interfaces/outputs";
import type { VectorStore } from "@bernouy/text-search";

export type RepositorySearchQuery = CatalogueSearchInput;
export type RepositoryResourceReference = RepositorySearchResult["reference"];
export type RepositorySearchResult = CatalogueSearchOutput["results"][number];
export interface RepositorySearchRow extends RepositorySearchResult {
    readonly text: string;
}
export interface RepositorySearchSnapshot {
    readonly revision: string;
    readonly rows: readonly RepositorySearchRow[];
}
export interface RepositorySearchSource {
    load(): Promise<RepositorySearchSnapshot>;
}
export type RepositorySearchPage = CatalogueSearchOutput;
export interface RepositoryDiscoverySource {
    readonly id: string;
    search(query: RepositorySearchQuery): Promise<RepositorySearchPage>;
    read(reference: RepositoryResourceReference): Promise<Uint8Array>;
}
export type RepositorySearchVectorStore = VectorStore;
