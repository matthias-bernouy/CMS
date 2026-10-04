import type { CollectionCapabilityRequirement } from "@bernouy/cms-repository/collections";
import type { ReleaseDigest } from "@bernouy/cms-repository/contracts";

export interface CollectionViewExecutionConsumer {
    readonly siteId: string;
    readonly publisherId: string;
    readonly collectionId: string;
    readonly collectionVersion: string;
    readonly collectionDigest: string;
    readonly viewId: string;
    readonly viewGeneration: number;
}

export interface CollectionViewExecutionTarget {
    readonly contractId: string;
    readonly capabilityIds: readonly string[];
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly installationId: string;
}

/** Immutable authority snapshot for one installed collection view. */
export interface CollectionViewExecutionPlan {
    readonly protocol: "ulvia-view-execution/v1";
    readonly consumer: CollectionViewExecutionConsumer;
    readonly selectionRevision: number;
    readonly dependencyRevision: string;
    readonly requirements: readonly CollectionCapabilityRequirement[];
    readonly targets: readonly CollectionViewExecutionTarget[];
}

export interface StoredCollectionViewExecutionGrant {
    readonly revision: number;
    readonly planDigest: `sha256:${string}`;
    readonly plan: CollectionViewExecutionPlan;
}

export interface CollectionViewExecutionActivation {
    readonly consumer: CollectionViewExecutionConsumer;
    readonly requirements: readonly CollectionCapabilityRequirement[];
}

/** Exact route proof copied into a trusted gateway invocation. */
export interface GatewayExecutionPin {
    readonly planDigest: `sha256:${string}`;
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly installationId: string;
}

export interface CollectionViewExecutionRequest extends CollectionViewExecutionConsumer {
    readonly contractId: string;
    readonly capabilityId: string;
}

export interface CollectionViewExecutionAuthority {
    activate(input: CollectionViewExecutionActivation): Promise<StoredCollectionViewExecutionGrant>;
    authorize(input: CollectionViewExecutionRequest): Promise<GatewayExecutionPin>;
}
