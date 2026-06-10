/**
 * @bernouy/cms-permissions — the CMS roles & permissions vocabulary.
 *
 * Pure and dependency-free: the permission catalogue (`urn:cms:*` +
 * gateway endpoint urns), role definitions and their grants, and the
 * `can()` decision helper. Storage lives in TSystem.roles (content
 * model); assignment lives in cms-auth (membership); enforcement points
 * (authGuard, gateway) combine the three at runtime.
 */

export {
    CMS_PERMISSION_CATALOGUE, CMS_PERMISSIONS, cmsPermission,
    ADMIN_ROLE, USER_ROLE, PUBLIC_ROLE, defaultRoleDefinitions,
    grantsFor, can,
} from "cms-permissions/core/permissions";
export type {
    CmsFeature, Grant, RoleDefinition, RolesConfig,
} from "cms-permissions/core/permissions";
export type { CMS_ROLES } from "cms-permissions/core/roles";
