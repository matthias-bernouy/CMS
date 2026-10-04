/**
 * @bernouy/cms-content — the content aggregate behind `CmsRepository`.
 *
 * Entities live in one package because they form ONE consistency domain
 * Pages, blocs, and settings live in one package because they form one
 * consistency domain. The Mongo implementation lives under
 * `@bernouy/cms-content/mongo`.
 */

// ── Entities ───────────────────────────────────────────────────────────
export type {
    BlocOwnership,
    BlocRecord,
    SiteBlocCollection,
    PresentationImage,
    SiteBlocDefinition,
    SiteBlocNode,
    SiteBlocSlot,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "cms-content/blocs/interfaces/blocs";
export {
    parsePresentationImage,
    presentationImageContentType,
    isPresentationImageBytes,
    blocThumbnailFromSource,
} from "cms-content/blocs/core/presentationImage";
export type { PageIndexingConfiguration, PageRoute, TPage, TPageRef } from "cms-content/pages/interfaces/pages";
export { languagePrefix, localPagePath, publicPagePath } from "cms-content/pages/core/paths/localizedPagePath";
export { pageSeoForLanguage } from "cms-content/pages/core/lifecycle/pageSeo";
export type {
    SiteOrganizationAddress,
    SiteOrganizationSettings,
    TSystem,
} from "cms-content/settings/interfaces/settings";
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
} from "cms-content/theme/interfaces/theme";
export { wrapBindingCore } from "cms-content/blocs/core/markup/bindingRoot";

// ── Repository seam ────────────────────────────────────────────────────
export type {
    ContentReader,
    PublishedRouteResolution,
    RenderableBloc,
} from "cms-content/application/interfaces/ContentReader";
export { createContentReader } from "cms-content/application/core/createContentReader";
export { resolvePublishedRoute } from "cms-content/pages/core/queries/resolvePublishedRoute";
export type {
    CmsRepository,
    BlocListItemResponse,
    BlocListOptions,
    PageLink,
    PageMeta,
    PageScan,
    PagesQuery,
    SiteBlocPublicationGuard,
    ValueCount,
} from "cms-content/application/interfaces/CmsRepository";
export { InMemoryCmsRepository } from "cms-content/application/default-implementation/memory/InMemoryCmsRepository";
export { filterAndSortPages } from "cms-content/pages/core/queries/pagesQuery";
export { defaultSystem, mergeSystemUpdate } from "cms-content/settings/core/system";
export {
    allTokens,
    composeThemeSettings,
    composeCollectionThemes,
    collectionThemeSource,
    createIntegrationThemeSource,
    defaultThemeSettings,
    generateThemeCss,
    integrationThemeSourceId,
    integrationThemeTokenId,
    integrationThemeVariable,
    reconcileIntegrationTheme,
    reconcileSubmittedThemeSettings,
    removeIntegrationTheme,
    validateThemeSettings,
} from "cms-content/theme/core";
export { countValues, normalizeTags } from "cms-content/pages/core/queries/counts";
export { projectPublicSiteOrganization } from "cms-content/settings/core/publicOrganization";
export {
    isPublishedPage,
    publishedPageSnapshot,
    serializePublishedPageSnapshot,
    type PublishedPageSnapshot,
} from "cms-content/pages/core/lifecycle/publication";
export {
    BlocOwnershipConflictError,
    BlocPublicationConflictError,
    BlocRevisionConflictError,
    BlocLifecycleConflictError,
    ContentValidationError,
    ContentConflictError,
    DuplicateBlocTagError,
    DuplicatePagePathError,
    PagePathUpdateConflictError,
    PagePathsStaleError,
    PageRevisionConflictError,
    SiteBlocLifecycleConflictError,
    SiteBlocNotFoundError,
    SiteBlocPublishedSlotConflictError,
    SiteBlocPublicationLockLostError,
    SiteBlocPublicationRecoveryRequiredError,
    SiteBlocPublicationRequiredError,
} from "cms-content/application/core/validation/errors";
export {
    archivedSiteDefinition,
    assertBlocOwner,
    CODE_MANAGED_BLOC_OWNERSHIP,
    nextDraftDefinition,
    normalizeBlocWrite,
    publishedSiteRecord,
    sameBlocOwner,
} from "cms-content/blocs/core/catalogue/records";
export {
    DEFAULT_SITE_BLOC_COLLECTION_ID,
    validateSiteBlocCollectionInput,
} from "cms-content/blocs/core/catalogue/siteBlocCollections";
export { nextSiteBlocUpdatedAt } from "cms-content/blocs/core/catalogue/timestamps";
export { SiteBlocPublicationQueue } from "cms-content/blocs/core/publication/SiteBlocPublicationQueue";
export {
    validateBlocWrite,
    validateNativeSiteBlocNode,
    validateSiteBlocDefinition,
    validateSiteBlocSnapshot,
} from "cms-content/blocs/core/validation";
export {
    isNativeHtmlTag,
    isPlatformNativeAttributeAllowed,
    isPlatformNativeContentTag,
    isPlatformAuthorableNativeTag,
    isPlatformManagedNativeElementTag,
    isSiteBlocNativeAttributeAllowed,
    isSiteBlocNativeStructureTag,
    PLATFORM_NATIVE_ADDABLE_TAGS,
    PLATFORM_MANAGED_NATIVE_ELEMENT_TAGS,
    PLATFORM_NATIVE_CONTEXTUAL_TAGS,
    PLATFORM_NATIVE_RICH_TEXT_TAGS,
    PLATFORM_NATIVE_SEMANTIC_TAGS,
} from "cms-content/blocs/core/validation/nativeHtml";
export {
    isCmsMediaSource,
    nativeAttributeSetIssue,
    nativeAttributeValueIssue,
} from "cms-content/blocs/core/validation/nativeAttributeValues";
export { validateSiteBlocDefaultContent } from "cms-content/blocs/core/markup/validation/nativeContent";
export {
    isCmsBindingAttribute,
    nativeBindingAttributeIssue,
    nativeFormBindingIssue,
} from "cms-content/blocs/core/validation/nativeBindings";
export { findPagesReferencingBloc, findPagesReferencingText } from "cms-content/pages/core/queries/pagesReferencing";
export { createBlocUsageResolver } from "cms-content/blocs/core/usage/resolveUsedBlocTags";
export { findUsedBlocTags } from "cms-content/blocs/core/usage/findUsedBlocTags";
export { buildBlocFoucShellCss } from "cms-content/blocs/core/composition/buildBlocFoucShellCss";
export {
    COMPOSITION_CONTROLLER_ATTRIBUTE,
    COMPOSITION_CONTROLLER_RUNTIME_ATTRIBUTE,
    COMPOSITION_AUTHORED_ATTRIBUTE,
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    expandCompositions,
    type CompositionDefinition,
    type CompositionExpansionMode,
} from "cms-content/blocs/core/composition/expandCompositions";
export { generateBlocEntry, generateBlocSetEntry } from "cms-content/blocs/core/composition/buildBlocEntries";
export {
    collectCmsSourceBindings,
    type CmsSourceBindingReference,
} from "cms-content/pages/core/indexing/sourceBindings";
export {
    detectPageIndexingCandidates,
    type PageIndexingCandidate,
    type PageIndexingDetection,
    type PageIndexingDetectionOptions,
    type PageIndexingDetectionStatus,
} from "cms-content/pages/core/indexing/detection";
export {
    projectResolvedIndexingEntity,
    projectIndexingDiscoveryPage,
} from "cms-content/pages/core/indexing/projection";
export type { ProjectedIndexingDiscoveryItem } from "cms-content/pages/core/indexing/projection";

// ── Validation (rules live here; the decorator is the unbypassable barrier) ─
export { ValidatingCmsRepository } from "cms-content/application/core/ValidatingCmsRepository";
export {
    assertContentRefsExist,
    type ContentRefsReader,
} from "cms-content/blocs/core/markup/validation/assertContentRefsExist";
export {
    managedNativeElementIssue,
    type ManagedNativeElementContract,
} from "cms-content/blocs/core/markup/validation/managedNativeElements";
export { hardenStoredHtml } from "cms-content/blocs/core/markup/security/hardenStoredHtml";
export { validatePageSeo } from "cms-content/pages/core/validation/seo";
export { validatePageIndexingConfiguration } from "cms-content/pages/core/validation/indexing";
export { isSafeNavigationalUrl } from "cms-content/blocs/core/markup/security/safeUrl";
export {
    validatePagePath,
    validatePageTitle,
    validatePagePatch,
} from "cms-content/pages/core/validation/page";
export { canonicalSiteBaseUrl, validateSettingsPatch } from "cms-content/settings/core/validation";
export { coercePageRef, pageRefToString } from "cms-content/pages/core/validation/pageRef";
export {
    PAGE_METADATA_PLATFORM_VARIABLES,
    PAGE_METADATA_RESERVED_NAMESPACES,
    resolvePageMetadataTemplate,
    resolvePageMetadataTemplateResult,
    type PageMetadataContext,
    type PageMetadataScalar,
    type PageMetadataScope,
    type PageMetadataTemplateResult,
} from "cms-content/pages/core/rendering/pageMetadata";

// ── HTTP handlers (mounted by surfaces) ────────────────────────────────
export { generateStyleEntry } from "cms-content/theme/core/generateStyleEntry";
export {
    PUBLISHED_PAGE_SNAPSHOT_ROUTE,
    PUBLISHED_PAGE_SNAPSHOT_SCHEMA,
    publishedPageSnapshotUrl,
    servePublishedPageSnapshot,
} from "cms-content/pages/http/publishedPageSnapshot";

// ── Constants & utils ──────────────────────────────────────────────────
export * from "cms-content/application/core/cacheKeys";
export * from "cms-content/application/core/validation/predicates";
export * from "cms-content/blocs/core/markup/contentRefs";
export { derivePagePath } from "cms-content/pages/core/paths/pagePath";
export { sanitizeDomTree } from "cms-content/blocs/core/markup/security/sanitizeDomTree";
export { sanitizeSvgTree } from "cms-content/blocs/core/markup/security/sanitizeSvgTree";
export { escapeRegex } from "cms-content/pages/core/queries/escapeRegex";

export { withInstalledCollections } from "cms-content/blocs/core/collections/installedRepository";
