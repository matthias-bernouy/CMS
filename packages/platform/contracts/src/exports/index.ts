export type { ContractEventDefinition } from "ulvia-contracts/interfaces/ContractEvent";
export { isJsonEventSchema } from "ulvia-contracts/core/events/schema";
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
    effectiveLineageEvents,
    findImplementedContract,
    resolveContractLineage,
} from "ulvia-contracts/core/compatibility/lineage/resolveLineage";

export type { CapabilityBinding, McpBindingDefinition } from "ulvia-contracts/interfaces/CapabilityBinding";

export type { ResolvedContract, ResolvedCapability, ResolvedEvent } from "ulvia-contracts/interfaces/ResolvedContract";

export type { SchemaDescriptor, SchemaField } from "ulvia-contracts/interfaces/UlviaSchema";
export {
    RESOLVED_SCHEMA_LIMITS,
    schemaResolverInputSchema,
    schemaDescriptorOutputSchema,
    schemaChoicesInputSchema,
    schemaChoicesOutputSchema,
} from "ulvia-contracts/core/language/resolution/protocol";
