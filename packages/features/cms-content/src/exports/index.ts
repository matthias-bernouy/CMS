/**
 * @bernouy/cms-content — the content aggregate behind `CmsRepository`.
 *
 * Entities live in one package because they form ONE consistency domain
 * (pages embed blocs, templates prototype pages, snippets expand into
 * content, the settings shell wraps every render) — but each has its own
 * interface file, so promoting one to a package later is mechanical.
 * The Mongo implementation lives under `@bernouy/cms-content/mongo`.
 */

// ── Entities ───────────────────────────────────────────────────────────
export type { TBloc }            from "cms-content/interfaces/blocs";
export type { TPage, TPageRef }  from "cms-content/interfaces/pages";
export type { TTemplate }        from "cms-content/interfaces/templates";
export type { TSnippet }         from "cms-content/interfaces/snippets";
export type { TSystem }          from "cms-content/interfaces/settings";
export { DEFAULT_SHELL, composeShell } from "cms-content/interfaces/settings";

// ── Repository seam ────────────────────────────────────────────────────
export type {
    CmsRepository, BlocListItemResponse, PageLink, PageMeta, PagesQuery,
} from "cms-content/interfaces/CmsRepository";
export { InMemoryCmsRepository } from "cms-content/default-implementation/InMemoryCmsRepository";
export { filterAndSortPages }    from "cms-content/core/pagesQuery";
export { expandSnippets, type SnippetReader } from "cms-content/core/expandSnippets";
export { assertContentRefsExist, type ContentRefsReader } from "cms-content/core/assertContentRefsExist";
export { hardenStoredHtml } from "cms-content/core/hardenStoredHtml";
export { ContentValidationError, ContentConflictError } from "cms-content/core/errors";
export { upsertRole, deleteRole, type RoleDto, type RoleHolderCounter } from "cms-content/core/roles";

// ── HTTP (mountable by surfaces) ───────────────────────────────────────
export { registerStyleEndpoint } from "cms-content/http/registerStyleEndpoint";

// ── Constants & utils ──────────────────────────────────────────────────
export * from "cms-content/core/constants/p9r-constants";
export * from "cms-content/core/constants/editorAttributes";
export * from "cms-content/core/utils/validation";
export * from "cms-content/core/utils/contentRefs";
export { sanitizeDomTree } from "cms-content/core/utils/sanitizeDomTree";
export { escapeRegex }     from "cms-content/core/utils/escapeRegex";
