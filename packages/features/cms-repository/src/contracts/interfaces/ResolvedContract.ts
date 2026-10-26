import type { CapabilityDefinition, ContractParentReference, ContractRelease } from "./ContractRelease";
import type { ReleaseDigest } from "../core/admission/digest";

/** An executable view, separate from the immutable authored artifact. */
export interface ResolvedCapability {
    readonly owner: ContractParentReference;
    readonly definition: CapabilityDefinition;
}

export interface ResolvedContract {
    readonly release: ContractRelease;
    readonly digest: ReleaseDigest;
    /** Concrete release first, followed by its exact ancestors. */
    readonly lineage: readonly Readonly<{ release: ContractRelease; digest: ReleaseDigest }>[];
    readonly capabilities: readonly ResolvedCapability[];
}
