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
export {
    Editor,
    type SettingSection,
} from "../interfaces/Editor";
export type {
    DataExpression,
    DataField,
    DataFieldType,
    DataScope,
    EditorCatalog,
    EditorCatalogEntry,
    EditorConstructor,
    PageLinkSetting,
    SchemaPickerMethod,
    SchemaPickerSetting,
    SegmentedSetting,
    SelectSetting,
    Setting,
    SettingMetadata,
    SettingOption,
    SettingType,
    TextareaSetting,
    TextSetting,
    ToggleSetting,
} from "../interfaces/Editor";

// ── Repository seam ────────────────────────────────────────────────────
export type { ContentReader } from "cms-content/interfaces/ContentReader";
export type {
    CmsRepository, BlocListItemResponse, PageLink, PageMeta, PagesQuery, ValueCount,
} from "cms-content/interfaces/CmsRepository";
export { InMemoryCmsRepository } from "cms-content/default-implementation/InMemoryCmsRepository";
export { filterAndSortPages }    from "cms-content/core/pagesQuery";
export { defaultSystem, mergeSystemUpdate } from "cms-content/core/system";
export { countValues, normalizeTags } from "cms-content/core/counts";
export { isPublishedPage } from "cms-content/core/publication";
export { expandSnippets, type SnippetReader } from "cms-content/core/expandSnippets";
export { ContentValidationError, ContentConflictError, DuplicateBlocTagError } from "cms-content/core/errors";
export { findPagesReferencingBloc, findPagesReferencingText } from "cms-content/core/dependencies/pagesReferencing";
export { findUsedBlocTags } from "cms-content/core/blocs/findUsedBlocTags";
export { generateBlocEntry, generateBlocSetEntry } from "cms-content/core/blocs/buildBlocEntries";

// ── Validation (rules live here; the decorator is the unbypassable barrier) ─
export { ValidatingCmsRepository } from "cms-content/core/validation/ValidatingCmsRepository";
export { assertContentRefsExist, type ContentRefsReader } from "cms-content/core/validation/assertContentRefsExist";
export { hardenStoredHtml } from "cms-content/core/validation/hardenStoredHtml";
export { validatePagePath, validatePageTitle, validatePagePatch }   from "cms-content/core/validation/pages";
export { validateSnippetIdentifier, validateSnippetPatch }          from "cms-content/core/validation/snippets";
export { validateTemplateIdentifier, validateTemplatePatch }        from "cms-content/core/validation/templates";
export { validateSettingsPatch } from "cms-content/core/validation/settings";
export { coercePageRef, pageRefToString } from "cms-content/core/validation/pageRef";

// ── HTTP handlers (mounted by surfaces) ────────────────────────────────
export { generateStyleEntry } from "cms-content/http/generateStyleEntry";

// ── Constants & utils ──────────────────────────────────────────────────
export * from "cms-content/core/constants/p9r-constants";
export * from "cms-content/core/constants/editorAttributes";
export * from "cms-content/core/validation/predicates";
export * from "cms-content/core/utils/contentRefs";
export { sanitizeDomTree } from "cms-content/core/utils/sanitizeDomTree";
export { sanitizeSvgTree } from "cms-content/core/utils/sanitizeSvgTree";
export { escapeRegex }     from "cms-content/core/utils/escapeRegex";
