import type { CollectionCapabilityRequirement } from "@bernouy/cms-repository/collections";
import type { ReleaseDigest } from "@bernouy/cms-repository/contracts";

export interface InstalledCollectionPageExecutionConsumer {
    readonly kind: "collection";
    readonly siteId: string;
    readonly publisherId: string;
    readonly collectionId: string;
    readonly collectionVersion: string;
    readonly collectionDigest: string;
    readonly pageId: string;
    readonly pageGeneration: number;
}

export interface SitePageExecutionConsumer {
    readonly kind: "site";
    readonly siteId: string;
    readonly pageId: string;
    readonly pageRevision: number;
}

export type PageExecutionConsumer = InstalledCollectionPageExecutionConsumer | SitePageExecutionConsumer;

export interface PageExecutionTarget {
    readonly contractId: string;
    readonly capabilityIds: readonly string[];
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly installationId: string;
}

/** Immutable authority snapshot for one collection-owned or site-owned Page. */
export interface PageExecutionPlan {
    readonly protocol: "ulvia-page-execution/v2";
    readonly consumer: PageExecutionConsumer;
    readonly selectionRevision: number;
    readonly dependencyRevision: string;
    readonly requirements: readonly CollectionCapabilityRequirement[];
    readonly targets: readonly PageExecutionTarget[];
}

export interface StoredPageExecutionGrant {
    readonly revision: number;
    readonly planDigest: `sha256:${string}`;
    readonly plan: PageExecutionPlan;
}

export interface PageExecutionActivation {
    readonly consumer: PageExecutionConsumer;
    readonly requirements: readonly CollectionCapabilityRequirement[];
}

/** Exact route proof copied into a trusted gateway invocation. */
export interface GatewayExecutionPin {
    readonly planDigest: `sha256:${string}`;
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly installationId: string;
}

export type PageExecutionRequest = PageExecutionConsumer & {
    readonly contractId: string;
    readonly capabilityId: string;
};

export interface PageExecutionAuthority {
    activate(input: PageExecutionActivation): Promise<StoredPageExecutionGrant>;
    authorize(input: PageExecutionRequest): Promise<GatewayExecutionPin>;
}
