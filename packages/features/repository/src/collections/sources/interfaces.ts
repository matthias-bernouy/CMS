export type CollectionRepositoryEntry = Readonly<{
    repositoryId: string;
    publisherId: string;
    collectionId: string;
    version: string;
    digest: string;
    name: string;
    description: string;
    blocCount: number;
    hasTheme: boolean;
    browserRisk: "none" | "review" | "high";
    browserRiskDigest: string;
    javaScriptBlocCount: number;
    frameBlocCount: number;
    externalFrameOrigins: readonly string[];
    scriptsWithSameOrigin: boolean;
}>;

export type CollectionRepositoryReference = Pick<
    CollectionRepositoryEntry,
    "publisherId" | "collectionId" | "version" | "digest"
>;

export interface CollectionRepositoryBundle {
    readonly release: unknown;
    readonly assets: readonly CollectionBundleAsset[];
}

/** A source lists release metadata and resolves immutable bytes on the server. */
export interface CollectionRepositorySource {
    readonly id: string;
    list(): Promise<CollectionRepositoryEntry[]>;
    /** Untrusted release JSON without assets; consumers verify its exact digest before using it. */
    getMetadata(reference: CollectionRepositoryReference): Promise<unknown>;
    get(reference: CollectionRepositoryReference): Promise<CollectionRepositoryBundle>;
}
import type { CollectionBundleAsset } from "../interfaces/CollectionAssets";
