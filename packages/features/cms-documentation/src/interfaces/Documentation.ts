import type { AdmittedContractRelease, ReleaseDigest } from "@bernouy/cms-repository/contracts";

export interface DocumentationReference {
    readonly contractId: string;
    readonly releaseDigest: ReleaseDigest;
    readonly path: string;
}
export interface DocumentationScope {
    readonly revision: string;
    readonly releases: readonly AdmittedContractRelease[];
}
export interface DocumentationSource {
    resolve(): Promise<DocumentationScope>;
    isCurrent(revision: string): Promise<boolean>;
    read(reference: DocumentationReference): Promise<Blob | null>;
}
export type { Embeddings as DocumentationEmbeddings } from "@bernouy/text-search";
export type { VectorStore as DocumentationVectorStore } from "@bernouy/text-search";
export interface DocumentationChunk {
    readonly reference: DocumentationReference;
    readonly version: string;
    readonly title: string;
    readonly heading: string;
    readonly content: string;
    readonly offset: number;
    readonly capabilities: readonly string[];
}
