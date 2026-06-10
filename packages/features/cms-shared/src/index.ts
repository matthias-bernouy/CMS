/**
 * @bernouy/cms-shared — what remains of the CMS grab-bag while it gets
 * dissolved into feature packages (cms-files and cms-secrets are out;
 * permissions, model and content are next).
 *
 * Currently holds: the content contracts (CmsRepository + models) and their
 * implementations, the permissions vocabulary, the bloc compile pipeline
 * (`prepare_bloc`, `validateBloc`, `p9rExternalsPlugin`), the theme style
 * endpoint, the p9r-* constants, and shared utils.
 */

// ── Domain roles ───────────────────────────────────────────────────────
export type CMS_ROLES = "admin" | "user";

// ── Permissions (roles vocabulary + pure decision helpers) ─────────────
export {
    CMS_PERMISSION_CATALOGUE, CMS_PERMISSIONS, cmsPermission,
    ADMIN_ROLE, USER_ROLE, PUBLIC_ROLE, defaultRoleDefinitions,
    grantsFor, can,
} from "cms-shared/permissions/permissions";
export type {
    CmsFeature, Grant, RoleDefinition, RolesConfig,
} from "cms-shared/permissions/permissions";

// ── Content interfaces ─────────────────────────────────────────────────
export type {
    CmsRepository, BlocListItemResponse, PageLink, PageMeta, PagesQuery,
} from "cms-shared/interfaces/CmsRepository";
export { filterAndSortPages } from "cms-shared/default-implementation/CmsRepository/pagesQuery";
export type {
    TPage, TBloc, TTemplate, TSnippet, TSystem, TPageRef,
} from "cms-shared/interfaces/models";
export { DEFAULT_SHELL, composeShell } from "cms-shared/interfaces/models";

// ── Default implementations ────────────────────────────────────────────
export { InMemoryCmsRepository } from "cms-shared/default-implementation/CmsRepository/memory";
export { MongoCmsRepository }    from "cms-shared/default-implementation/CmsRepository/mongodb";

// ── Bloc compile pipeline ──────────────────────────────────────────────
export { prepare_bloc }                  from "cms-shared/blocs/prepare_bloc";
export { validateBloc, validateBlocTag } from "cms-shared/blocs/validateBloc";
export { p9rExternalsPlugin }            from "cms-shared/blocs/p9rExternalsPlugin";

// ── Server helpers ─────────────────────────────────────────────────────
export { registerStyleEndpoint } from "cms-shared/server/registerStyleEndpoint";

// ── Constants ──────────────────────────────────────────────────────────
export * from "cms-shared/constants/p9r-constants";
export * from "cms-shared/constants/editorAttributes";

// ── Utils ──────────────────────────────────────────────────────────────
export * from "cms-shared/utils/validation";
export * from "cms-shared/utils/contentRefs";
export { sanitizeDomTree } from "cms-shared/utils/sanitizeDomTree";
export { escapeRegex } from "cms-shared/utils/escapeRegex";
