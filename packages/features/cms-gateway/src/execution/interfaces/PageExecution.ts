import type { CollectionCapabilityRequirement } from "@bernouy/cms-repository/collections";
import type { ReleaseDigest } from "@bernouy/cms-repository/contracts";

export interface CollectionPageExecutionConsumer {
    readonly siteId: string;
    readonly publisherId: string;
    readonly collectionId: string;
    readonly collectionVersion: string;
    readonly collectionDigest: string;
    readonly pageId: string;
    readonly pageGeneration: number;
}

export interface CollectionPageExecutionTarget {
    readonly contractId: string;
    readonly capabilityIds: readonly string[];
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly installationId: string;
}

/** Immutable authority snapshot for one installed collection Page. */
export interface CollectionPageExecutionPlan {
    readonly protocol: "ulvia-page-execution/v1";
    readonly consumer: CollectionPageExecutionConsumer;
    readonly selectionRevision: number;
    readonly dependencyRevision: string;
    readonly requirements: readonly CollectionCapabilityRequirement[];
    readonly targets: readonly CollectionPageExecutionTarget[];
}

export interface StoredCollectionPageExecutionGrant {
    readonly revision: number;
    readonly planDigest: `sha256:${string}`;
    readonly plan: CollectionPageExecutionPlan;
}

export interface CollectionPageExecutionActivation {
    readonly consumer: CollectionPageExecutionConsumer;
    readonly requirements: readonly CollectionCapabilityRequirement[];
}

/** Exact route proof copied into a trusted gateway invocation. */
export interface GatewayExecutionPin {
    readonly planDigest: `sha256:${string}`;
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly installationId: string;
}

export interface CollectionPageExecutionRequest extends CollectionPageExecutionConsumer {
    readonly contractId: string;
    readonly capabilityId: string;
}

export interface CollectionPageExecutionAuthority {
    activate(input: CollectionPageExecutionActivation): Promise<StoredCollectionPageExecutionGrant>;
    authorize(input: CollectionPageExecutionRequest): Promise<GatewayExecutionPin>;
}
