import type { ContractParentReference, ResolvedContract } from "@bernouy/ulvia-contracts";
import type {
    CollectionBootstrapPage,
    CollectionBootstrapReference,
    CollectionCapabilityRequirement,
} from "../../interfaces/CollectionRelease";
import type { CollectionBrowserRiskReport } from "../../core/validation/browserCapabilities";

export type InitializationRoot = Omit<CollectionBootstrapReference, "omitPages">;
export type InitializationRelease = Readonly<{ release: unknown; digest: string }>;
export type InitializationPage = Omit<CollectionBootstrapPage, "title" | "description"> &
    Readonly<{
        owner: InitializationRoot;
        title: string;
        description: string;
        receiptId: string;
    }>;

export interface InitializationLimits {
    readonly maxCollections: number;
    readonly maxRecipes: number;
    readonly maxPages: number;
    readonly maxDepth: number;
    readonly maxMetadataBytes: number;
    readonly maxDeclaredAssetBytes: number;
    readonly maxContracts: number;
}

export interface InitializationOptions {
    /** Current host-selected exact execution views; a recipe cannot select or invent providers. */
    readonly selected: readonly ResolvedContract[];
    readonly denied?: readonly Readonly<{ contractId: string; capabilityId: string }>[];
    readonly locale?: string;
    readonly limits?: Readonly<InitializationLimits>;
    readonly signal?: AbortSignal;
}

/** Read-only preparation evidence, not authorization to modify an instance. */
export interface CollectionInitializationPlan {
    readonly protocol: "ulvia-initialization-plan/v1";
    readonly root: InitializationRoot | null;
    readonly locale: string;
    readonly collections: readonly Readonly<{
        publisherId: string;
        collectionId: string;
        version: string;
        digest: string;
        browserRisk: CollectionBrowserRiskReport;
        browserRiskDigest: string;
    }>[];
    readonly contracts: readonly ContractParentReference[];
    readonly requirements: readonly CollectionCapabilityRequirement[];
    readonly pages: readonly InitializationPage[];
    readonly digest: `sha256:${string}`;
}
