export { DeferredDelegationStore } from "cms-gateway/access/delegation/authority/DeferredDelegationStore";
export { DelegationAuthority } from "cms-gateway/access/delegation/authority/DelegationAuthority";
export { InMemoryDelegationStore } from "cms-gateway/access/delegation/InMemoryDelegationStore";
export {
    DELEGATION_HEADER,
    PROVIDER_AUTHORITY_HEADER,
    validDelegationTicket,
} from "cms-gateway/access/delegation/wire";
export type {
    GatewayDelegationAuthority,
    DelegationDispatchAuthority,
    DelegationAuthorization,
    DelegationSource,
    DelegationScope,
    DelegationTarget,
    DelegationActor,
    DelegationContext,
    PreparedDelegation,
    DelegationStore,
    DelegationRecord,
} from "cms-gateway/access/delegation/interfaces";

export { DELEGATION_LIMITS } from "cms-gateway/access/delegation/limits";
