export type { ProviderIdentityScope, ProviderIdentityService } from "cms-gateway/identity/ProviderIdentityService";
export { ProviderIdentityAliases } from "cms-gateway/identity/ProviderIdentityAliases";
export {
    CMS_IDENTITY_AUTHORITY,
    type IdentityAlias,
    type IdentityAuthority,
    type IdentityBinder,
    type IdentityKind,
    type IdentityResolver,
    type IdentityService,
    type IdentitySubjectId,
    type IdentityValue,
} from "cms-gateway/identity/aliases/interfaces/Identity";
export { IdentityAliasConflictError, InvalidIdentityError } from "cms-gateway/identity/aliases/core/errors";
export { InMemoryIdentityService } from "cms-gateway/identity/aliases/default-implementation/InMemoryIdentityService";
