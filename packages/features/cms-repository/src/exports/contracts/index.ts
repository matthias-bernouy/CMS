export {
    computeReleaseDigest,
    isReleaseDigest,
    type ReleaseDigest,
} from "cms-repository/contracts/core/admission/digest";
export { ReleaseValidationError, type ReleaseValidationCode } from "cms-repository/contracts/core/protocol/errors";
export { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "cms-repository/contracts/core/protocol/limits";
export { canonicalReleaseBytes, canonicalizeRelease } from "cms-repository/contracts/core/admission/release";
export {
    admitContractRelease,
    admitContractReleaseJson,
    verifyStoredContractReleaseJson,
    type AdmittedContractRelease,
    type VerifiedFixtureAsset,
} from "cms-repository/contracts/core/admission/admitContractRelease";
export {
    admitContractBundle,
    admitContractBundleJson,
    type ContractBundleAsset,
} from "cms-repository/contracts/core/admission/admitContractBundle";
export type {
    CapabilityAccess,
    CapabilityBehavior,
    CapabilityDefinition,
    CapabilityRequirement,
    CapabilityErrorDefinition,
    CapabilityExecution,
    CapabilityResponseEffect,
    CapabilityMockDefinition,
    CapabilityMockOutcome,
    CapabilityDeprecation,
    ContractFixtureAssetDefinition,
    ContractParentReference,
    ContractRelease,
} from "cms-repository/contracts/interfaces/ContractRelease";
export {
    parseContractRelease,
    parseContractReleaseJson,
} from "cms-repository/contracts/core/parsing/parseContractRelease";
export {
    resolveContract,
    effectiveLineageCapabilities,
    findImplementedContract,
    resolveContractLineage,
} from "cms-repository/contracts/core/compatibility/lineage/resolveLineage";

export type { CapabilityBinding, McpBindingDefinition } from "cms-repository/contracts/interfaces/CapabilityBinding";

export type { ResolvedContract, ResolvedCapability } from "cms-repository/contracts/interfaces/ResolvedContract";
