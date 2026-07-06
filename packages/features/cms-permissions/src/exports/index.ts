/**
 * @bernouy/cms-permissions — CMS roles & permissions.
 *
 * Owns the full vocabulary (permission catalogue `urn:cms:*` + gateway
 * endpoint urns, role definitions, grants, the `can()` decision helper)
 * AND the role storage seam: the `RolesRepository` contract + in-memory
 * implementation here, the Mongo adapter under `@bernouy/cms-permissions/mongo`.
 * Assignment (sub→role) lives in cms-auth; enforcement points (authGuard,
 * gateway) combine the pieces at runtime.
 */

// ── Vocabulary ─────────────────────────────────────────────────────────
export {
    CMS_PERMISSION_CATALOGUE, CMS_PERMISSIONS, cmsPermission,
    ADMIN_ROLE, USER_ROLE, PUBLIC_ROLE, defaultRoleDefinitions,
    grantsFor, effectiveGrantsFor, can,
} from "cms-permissions/core/permissions";
export type {
    CmsFeature, Grant, RoleDefinition, RolesConfig,
} from "cms-permissions/core/permissions";
export type { CMS_ROLES } from "cms-permissions/core/roles";

// ── Roles storage seam ─────────────────────────────────────────────────
export type { RolesRepository, RoleHolderCounter } from "cms-permissions/interfaces/RolesRepository";
export { InMemoryRolesRepository } from "cms-permissions/default-implementation/memory/InMemoryRolesRepository";
export { ValidatingRolesRepository } from "cms-permissions/core/ValidatingRolesRepository";

// ── Role mutation rules ────────────────────────────────────────────────
export { upsertRole, deleteRole, validateGrants, ROLE_ID_RE, type RoleDto } from "cms-permissions/core/mutateRole";
export { RoleValidationError, RoleConflictError } from "cms-permissions/core/errors";
