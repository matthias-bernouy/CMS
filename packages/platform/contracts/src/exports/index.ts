export { computeReleaseDigest, isReleaseDigest, type ReleaseDigest } from "ulvia-contracts/core/admission/digest";
export { ReleaseValidationError, type ReleaseValidationCode } from "ulvia-contracts/core/protocol/errors";
export { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "ulvia-contracts/core/protocol/limits";
export { canonicalReleaseBytes, canonicalizeRelease } from "ulvia-contracts/core/admission/release";
export {
    admitContractRelease,
    admitContractReleaseJson,
    verifyStoredContractReleaseJson,
    type AdmittedContractRelease,
    type VerifiedFixtureAsset,
} from "ulvia-contracts/core/admission/admitContractRelease";
export {
    admitContractBundle,
    admitContractBundleJson,
    type ContractBundleAsset,
} from "ulvia-contracts/core/admission/admitContractBundle";
export type {
    CapabilityAccess,
    CapabilityBehavior,
    CapabilityDefinition,
    CapabilityErrorDefinition,
    CapabilityExecution,
    CapabilityResponseEffect,
    CapabilityMockDefinition,
    CapabilityMockOutcome,
    CapabilityDeprecation,
    ContractFixtureAssetDefinition,
    ContractDocumentationDefinition,
    ContractParentReference,
    ContractRelease,
} from "ulvia-contracts/interfaces/ContractRelease";
export { parseContractRelease, parseContractReleaseJson } from "ulvia-contracts/core/parsing/parseContractRelease";
export {
    resolveContract,
    effectiveLineageCapabilities,
    findImplementedContract,
    resolveContractLineage,
} from "ulvia-contracts/core/compatibility/lineage/resolveLineage";

export type { CapabilityBinding, McpBindingDefinition } from "ulvia-contracts/interfaces/CapabilityBinding";

export type { ResolvedContract, ResolvedCapability } from "ulvia-contracts/interfaces/ResolvedContract";
