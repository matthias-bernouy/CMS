export { assertIJson, canonicalIJsonBytes, canonicalizeIJson } from "ulvia-contracts/core/protocol/canonical";
export { parseStrictJson } from "ulvia-contracts/core/protocol/json";
export { deepFreeze } from "ulvia-contracts/core/protocol/values";
export { catalogueRevision } from "ulvia-contracts/core/protocol/revision";
export {
    assertResourceId,
    isResourceId,
    isResourceNamespace,
    resourceName,
    resourcePublisher,
    resourceRuntimeNamespace,
} from "ulvia-contracts/core/parsing/resources";
export {
    parseCapabilityOperationHandle,
    type CapabilityOperationHandle,
} from "ulvia-contracts/core/protocol/operation";
export { MAX_CAPABILITY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH } from "ulvia-contracts/core/protocol/limits";
