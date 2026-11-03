import type { VectorStore } from "@bernouy/text-search";

type RepositoryResourceKind = "collection" | "bloc" | "contract" | "provider-manifest";
export interface RepositorySearchQuery {
    readonly query: string;
    readonly kinds?: readonly RepositoryResourceKind[];
    readonly publisherId?: string;
    readonly contractId?: string;
    readonly limit?: number;
    readonly cursor?: string;
}
export interface RepositoryResourceReference {
    readonly kind: Exclude<RepositoryResourceKind, "bloc">;
    readonly publisherId: string;
    readonly id: string;
    readonly version: string;
    readonly digest: string;
}
export interface RepositorySearchResult {
    readonly reference: RepositoryResourceReference;
    readonly blocId?: string;
    readonly name: string;
    readonly description: string;
    readonly categories: readonly string[];
    readonly contractIds: readonly string[];
}
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
export interface RepositorySearchPage {
    readonly revision: string;
    readonly mode: "hybrid" | "lexical";
    readonly degraded: boolean;
    readonly results: readonly RepositorySearchResult[];
    readonly nextCursor?: string;
}
export interface RepositoryDiscoverySource {
    readonly id: string;
    search(query: RepositorySearchQuery): Promise<RepositorySearchPage>;
    read(reference: RepositoryResourceReference): Promise<Uint8Array>;
}
export type RepositorySearchVectorStore = VectorStore;
