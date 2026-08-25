/**
 * @bernouy/cms-content — the content aggregate behind `CmsRepository`.
 *
 * Entities live in one package because they form ONE consistency domain
 * (pages embed blocs, templates prototype pages, the settings shell wraps every
 * render) — but each has its own interface file, so promoting one to a package
 * later is mechanical.
 * The Mongo implementation lives under `@bernouy/cms-content/mongo`.
 */

// ── Entities ───────────────────────────────────────────────────────────
export type {
    BlocOwnership,
    BlocRecord,
    SiteBlocDefinition,
    SiteBlocNode,
    SiteBlocSlot,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/interfaces/blocs";
export type { PageIndexingConfiguration, TPage, TPageRef } from "cms-content/interfaces/pages";
export type { TTemplate } from "cms-content/interfaces/templates";
export type { SiteOrganizationAddress, SiteOrganizationSettings, TSystem } from "cms-content/interfaces/settings";
export type {
    IntegrationThemeContribution,
    ThemeCategoryContribution,
    ThemeCategory,
    ThemeDefinition,
    ThemeMode,
    ThemeSettings,
    ThemeSource,
    ThemeSourceOwner,
    ThemeToken,
    ThemeTokenContribution,
    ThemeTokenDefaults,
    ThemeTokenType,
} from "cms-content/interfaces/theme";
export { wrapBindingCore } from "cms-content/interfaces/settings";

// ── Repository seam ────────────────────────────────────────────────────
export type { ContentReader } from "cms-content/interfaces/ContentReader";
export type {
    CmsRepository,
    BlocListItemResponse,
    PageLink,
    PageMeta,
    PagesQuery,
    SiteBlocPublicationGuard,
    ValueCount,
} from "cms-content/interfaces/CmsRepository";
export { InMemoryCmsRepository } from "cms-content/default-implementation/InMemoryCmsRepository";
export { filterAndSortPages } from "cms-content/core/queries/pagesQuery";
export { defaultSystem, mergeSystemUpdate } from "cms-content/core/lifecycle/system";
export {
    allTokens,
    composeThemeSettings,
    createIntegrationThemeSource,
    defaultThemeSettings,
    generateThemeCss,
    integrationThemeSourceId,
    integrationThemeTokenId,
    integrationThemeVariable,
    organizeThemeSettings,
    reconcileIntegrationTheme,
    reconcileSubmittedThemeSettings,
    removeIntegrationTheme,
    themeSettingsFromCss,
    validateThemeSettings,
} from "cms-content/core/theme";
export { countValues, normalizeTags } from "cms-content/core/queries/counts";
export { projectPublicSiteOrganization } from "cms-content/core/queries/publicOrganization";
export {
    isPublishedPage,
    publishedPageSnapshot,
    serializePublishedPageSnapshot,
    type PublishedPageSnapshot,
} from "cms-content/core/lifecycle/publication";
export {
    BlocOwnershipConflictError,
    BlocPublicationConflictError,
    BlocRevisionConflictError,
    BlocLifecycleConflictError,
    ContentValidationError,
    ContentConflictError,
    DuplicateBlocTagError,
    DuplicatePagePathError,
    SiteBlocLifecycleConflictError,
    SiteBlocNotFoundError,
    SiteBlocPublishedSlotConflictError,
    SiteBlocPublicationLockLostError,
    SiteBlocPublicationRecoveryRequiredError,
    SiteBlocPublicationRequiredError,
} from "cms-content/core/validation/errors";
export {
    archivedSiteDefinition,
    assertBlocOwner,
    CODE_MANAGED_BLOC_OWNERSHIP,
    nextDraftDefinition,
    normalizeBlocWrite,
    publishedSiteRecord,
    sameBlocOwner,
} from "cms-content/core/blocs/records";
export { nextSiteBlocUpdatedAt } from "cms-content/core/blocs/timestamps";
export { SiteBlocPublicationQueue } from "cms-content/core/blocs/SiteBlocPublicationQueue";
export {
    validateBlocWrite,
    validateSiteBlocDefinition,
    validateSiteBlocSnapshot,
} from "cms-content/core/validation/blocs";
export { findPagesReferencingBloc, findPagesReferencingText } from "cms-content/core/queries/pagesReferencing";
export { createBlocUsageResolver } from "cms-content/core/blocs/resolveUsedBlocTags";
export { findUsedBlocTags } from "cms-content/core/blocs/findUsedBlocTags";
export { buildBlocFoucShellCss } from "cms-content/core/blocs/buildBlocFoucShellCss";
export { generateBlocEntry, generateBlocSetEntry } from "cms-content/core/blocs/buildBlocEntries";
export { collectCmsSourceBindings, type CmsSourceBindingReference } from "cms-content/core/editor/sourceBindings";
export {
    detectPageIndexingCandidates,
    type PageIndexingCandidate,
    type PageIndexingDetection,
    type PageIndexingDetectionOptions,
    type PageIndexingDetectionStatus,
} from "cms-content/core/editor/pageIndexingDetection";

// ── Validation (rules live here; the decorator is the unbypassable barrier) ─
export { ValidatingCmsRepository } from "cms-content/core/validation/ValidatingCmsRepository";
export {
    assertContentRefsExist,
    type ContentRefsReader,
} from "cms-content/core/validation/documents/assertContentRefsExist";
export { hardenStoredHtml } from "cms-content/core/validation/hardenStoredHtml";
export {
    validatePageIndexingConfiguration,
    validatePagePath,
    validatePageTitle,
    validatePagePatch,
} from "cms-content/core/validation/documents/pages";
export {
    validateTemplateIdentifier,
    validateTemplateCreate,
    validateTemplatePatch,
} from "cms-content/core/validation/documents/templates";
export { canonicalSiteBaseUrl, validateSettingsPatch } from "cms-content/core/validation/settings";
export { coercePageRef, pageRefToString } from "cms-content/core/validation/documents/pageRef";
export {
    PAGE_METADATA_PLATFORM_VARIABLES,
    PAGE_METADATA_RESERVED_NAMESPACES,
    resolvePageMetadataTemplate,
    resolvePageMetadataTemplateResult,
    type PageMetadataContext,
    type PageMetadataScalar,
    type PageMetadataScope,
    type PageMetadataTemplateResult,
} from "cms-content/core/editor/pageMetadataVariables";

// ── HTTP handlers (mounted by surfaces) ────────────────────────────────
export { generateStyleEntry } from "cms-content/http/generateStyleEntry";
export { executeSiteSystemSourceEndpoint } from "cms-content/http/systemSiteSource";
export {
    PUBLISHED_PAGE_SNAPSHOT_ROUTE,
    PUBLISHED_PAGE_SNAPSHOT_SCHEMA,
    publishedPageSnapshotUrl,
    servePublishedPageSnapshot,
} from "cms-content/http/publishedPageSnapshot";

// ── Constants & utils ──────────────────────────────────────────────────
export * from "cms-content/core/constants/p9r-constants";
export * from "cms-content/core/validation/predicates";
export * from "cms-content/core/utils/contentRefs";
export { derivePagePath } from "cms-content/core/utils/pagePath";
export { sanitizeDomTree } from "cms-content/core/utils/sanitizeDomTree";
export { sanitizeSvgTree } from "cms-content/core/utils/sanitizeSvgTree";
export { renderSafeMarkdown } from "cms-content/core/utils/renderSafeMarkdown";
export { escapeRegex } from "cms-content/core/utils/escapeRegex";
