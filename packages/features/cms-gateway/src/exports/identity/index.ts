export type {
    ProviderIdentityScope,
    ProviderIdentityService,
} from "cms-gateway/identity/interfaces/ProviderIdentityService";
export { ProviderIdentityAliases } from "cms-gateway/identity/core/ProviderIdentityAliases";
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
} from "cms-gateway/identity/interfaces/Identity";
export { IdentityAliasConflictError, InvalidIdentityError } from "cms-gateway/identity/core/errors";
export { InMemoryIdentityService } from "cms-gateway/identity/default-implementation/InMemoryIdentityService";
