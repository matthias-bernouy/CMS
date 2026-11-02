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
export interface DocumentationEmbeddings {
    readonly model: string;
    initialize?(signal: AbortSignal): Promise<void>;
    embed(
        texts: readonly string[],
        kind: "query" | "passage",
        signal: AbortSignal,
    ): Promise<readonly (readonly number[])[]>;
}
export interface DocumentationVectorStore {
    get(keys: readonly string[]): Promise<ReadonlyMap<string, readonly number[]>>;
    put(values: readonly { key: string; vector: readonly number[] }[]): Promise<void>;
}
export interface DocumentationChunk {
    readonly reference: DocumentationReference;
    readonly version: string;
    readonly title: string;
    readonly heading: string;
    readonly content: string;
    readonly offset: number;
    readonly capabilities: readonly string[];
}
