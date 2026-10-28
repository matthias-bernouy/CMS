export { DelegationAuthority } from "cms-gateway/access/delegation/DelegationAuthority";
export { InMemoryDelegationStore } from "cms-gateway/access/delegation/InMemoryDelegationStore";
export {
    DELEGATION_HEADER,
    PROVIDER_AUTHORITY_HEADER,
    validDelegationTicket,
} from "cms-gateway/access/delegation/wire";
export type {
    GatewayDelegationAuthority,
    DelegationSource,
    DelegationTarget,
    DelegationActor,
    DelegationContext,
    DelegationStore,
    DelegationRecord,
} from "cms-gateway/access/delegation/interfaces";
