/**
 * @bernouy/content — the content aggregate behind `ContentRepository`.
 *
 * Entities live in one package because they form ONE consistency domain
 * Pages, blocs, and settings live in one package because they form one
 * consistency domain. The Mongo implementation lives under
 * `@bernouy/content/mongo`.
 */

// ── Entities ───────────────────────────────────────────────────────────
export type {
    BlocOwnership,
    BlocBrowserCapabilities,
    BlocFrameSandboxPermission,
    BlocRecord,
    SiteBlocGroup,
    PresentationImage,
    SiteBlocDefinition,
    SiteBlocNode,
    SiteBlocSlot,
    SiteBlocSnapshot,
    TBloc,
    TBlocWrite,
} from "content/blocs/interfaces/blocs";
export type {
    ContentDiagnostic,
    PageLinkAnalysis,
    PageWriteFeedback,
    PageWriteResult,
} from "content/application/interfaces/diagnostics";
export {
    parsePresentationImage,
    presentationImageContentType,
    isPresentationImageBytes,
    blocThumbnailFromSource,
} from "content/blocs/core/presentationImage";
export type { PageIndexingConfiguration, PageRoute, TPage, TPageRef } from "content/pages/interfaces/pages";
export type { PageDocument } from "content/pages/interfaces/document";
export { pageDocument } from "content/pages/interfaces/pages";
export { MAX_PAGE_CONTENT_LENGTH } from "content/application/core/validation/fields";
export { readSystemSnapshot } from "content/settings/core/readSystemSnapshot";
export {
    listCmsPages,
    type CmsPageListItem,
    type CmsPagesListInput,
    type CmsPagesListOutput,
} from "content/pages/core/contracts/listPages";
export {
    CmsPageNotFoundError,
    renameCmsPage,
    type CmsPageRenameInput,
    type CmsPageRenameOutput,
} from "content/pages/core/contracts/renamePage";
export {
    getCmsPage,
    type CmsPageDetails,
    type CmsPageEditingDetails,
    type CmsPageRouteDetails,
    type CmsPageSeoDetails,
} from "content/pages/core/contracts/pageDetails";
export { updateCmsPageRoute, updateCmsPageSeo } from "content/pages/core/contracts/presentation";
export { createCmsPage, type CmsPageCreateInput } from "content/pages/core/contracts/createPage";
export {
    getCmsEditorCatalogue,
    type CmsEditorBloc,
    type CmsEditorCatalogue,
} from "content/pages/core/contracts/editorCatalogue";
export {
    deleteCmsPage,
    publishCmsPage,
    updateCmsPage,
    type CmsPageUpdateInput,
} from "content/pages/core/contracts/mutatePage";
export type {
    PageLinkTarget,
    PageReference,
    PageRouteReader,
    SitePageReference,
    ResolvedPageLink,
} from "content/pages/interfaces/routing";
export {
    assertPageContentLinks,
    createPageRouteReader,
    pageContentPaths,
    resolvePageLinkTarget,
} from "content/pages/core/routing/links";
export { validatePageReference } from "content/pages/core/routing/values";
export { PageRouteNotFoundError, PageReferencedError } from "content/pages/core/routing/errors";
export { analyzePageLinks, analyzePageLinkReport } from "content/pages/core/routing/analysis/analyze";
export { languagePrefix, localPagePath, publicPagePath } from "content/pages/core/paths/localizedPagePath";
export { pageSeoForLanguage } from "content/pages/core/lifecycle/pageSeo";
export type {
    SiteOrganizationAddress,
    SiteOrganizationSettings,
    TSystem,
} from "content/settings/interfaces/settings";
export type {
    IntegrationThemeContribution,
    ThemeCategoryContribution,
    ThemeCategory,
    ThemeDefinition,
    ThemeFontFace,
    ThemeMode,
    ThemeSettings,
    ThemeSource,
    ThemeSourceOwner,
    ThemeToken,
    ThemeTokenContribution,
    ThemeTokenDefaults,
    ThemeTokenType,
} from "content/theme/interfaces/theme";
export { wrapBindingCore } from "content/blocs/core/markup/bindingRoot";

// ── Repository seam ────────────────────────────────────────────────────
export type {
    ContentReader,
    PageRenderInputs,
    PageCapabilityRequirement,
    PublishedRouteResolution,
    RenderableBloc,
    RenderablePage,
    RenderablePageSource,
    RenderableRouteResolution,
} from "content/application/interfaces/ContentReader";
export { projectBlocList } from "content/application/core/projectBlocList";
export { createContentReader } from "content/application/core/createContentReader";
export { resolvePublishedRoute } from "content/pages/core/queries/resolvePublishedRoute";
export type {
    ContentRepository,
    ContentTextSnapshot,
    BlocListItemResponse,
    BlocListOptions,
    PageLink,
    PageMeta,
    PageScan,
    PagesQuery,
    SiteBlocPublicationGuard,
    ValueCount,
} from "content/application/interfaces/ContentRepository";
export { InMemoryContentRepository } from "content/application/default-implementation/memory/InMemoryContentRepository";
export { filterAndSortPages } from "content/pages/core/queries/pagesQuery";
export { defaultSystem, mergeSystemUpdate } from "content/settings/core/system";
export {
    allTokens,
    composeThemeSettings,
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
} from "content/theme/core";
export { countValues, normalizeTags } from "content/pages/core/queries/counts";
export { projectPublicSiteOrganization } from "content/settings/core/publicOrganization";
export {
    isPublishedPage,
    publishedPageSnapshot,
    serializePublishedPageSnapshot,
    type PublishedPageSnapshot,
} from "content/pages/core/lifecycle/publication";
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
} from "content/application/core/validation/errors";
export {
    archivedSiteDefinition,
    assertBlocOwner,
    CODE_MANAGED_BLOC_OWNERSHIP,
    nextDraftDefinition,
    normalizeBlocWrite,
    publishedSiteRecord,
    sameBlocOwner,
} from "content/blocs/core/catalogue/records";
export {
    DEFAULT_SITE_BLOC_GROUP_ID,
    validateSiteBlocGroupInput,
} from "content/blocs/core/catalogue/siteBlocGroups";
export {
    createCmsSiteBloc,
    getCmsSiteBloc,
    listCmsSiteBlocs,
    publishCmsSiteBloc,
    setCmsSiteBlocArchived,
    type CmsSiteBloc,
    type SiteBlocCreateInput,
    type SiteBlocIdentityInput,
} from "content/blocs/core/catalogue/siteBlocContracts";
export { nextSiteBlocUpdatedAt } from "content/blocs/core/catalogue/timestamps";
export { SiteBlocPublicationQueue } from "content/blocs/core/publication/SiteBlocPublicationQueue";
export { generateSiteBlocSourceBundle } from "content/blocs/core/publication/source/generateSiteBlocSourceBundle";
export {
    serializeSiteBlocDefault,
    serializeSiteBlocMarkup,
} from "content/blocs/core/publication/source/siteBlocHtml";
export {
    validateBlocWrite,
    validateNativeSiteBlocNode,
    validateSiteBlocDefinition,
    validateSiteBlocSnapshot,
} from "content/blocs/core/validation";
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
} from "content/blocs/core/validation/nativeHtml";
export {
    isCmsMediaSource,
    nativeAttributeSetIssue,
    nativeAttributeValueIssue,
} from "content/blocs/core/validation/nativeAttributeValues";
export { validateSiteBlocDefaultContent } from "content/blocs/core/markup/validation/nativeContent";
export {
    isCmsBindingAttribute,
    nativeBindingAttributeIssue,
    nativeFormBindingIssue,
} from "content/blocs/core/validation/nativeBindings";
export {
    findPagesReferencingBloc,
    findPagesReferencingFile,
    findPagesReferencingText,
} from "content/pages/core/queries/pagesReferencing";
export type { PageContentReference } from "content/pages/core/queries/contentReferences";
export { pageContentReferenceKey, pageContentReferenceKeys } from "content/pages/core/queries/contentReferences";
export { createBlocUsageResolver } from "content/blocs/core/usage/resolveUsedBlocTags";
export { findUsedBlocTags } from "content/blocs/core/usage/findUsedBlocTags";
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
} from "content/blocs/core/composition/expandCompositions";
export { generateBlocEntry, generateBlocSetEntry } from "content/blocs/core/composition/buildBlocEntries";
export {
    collectCmsMutationBindings,
    collectCmsQueryBindings,
    type CmsMutationBindingReference,
    type CmsQueryBindingReference,
} from "content/pages/core/indexing/operationBindings";
export {
    detectPageIndexingCandidates,
    type PageIndexingCandidate,
    type PageIndexingDetection,
    type PageIndexingDetectionStatus,
} from "content/pages/core/indexing/detection";
export {
    projectResolvedIndexingEntity,
    projectIndexingDiscoveryPage,
} from "content/pages/core/indexing/projection";
export type { ProjectedIndexingDiscoveryItem } from "content/pages/core/indexing/projection";

// ── Validation (rules live here; the decorator is the unbypassable barrier) ─
export { ValidatingContentRepository } from "content/application/core/ValidatingContentRepository";
export type {
    ContentBindingValidationOptions,
    SvgCapabilityValidator,
} from "content/application/core/validation/bindingCapabilities";
export type { SvgCapabilityTarget } from "content/blocs/core/markup/security/svgReference";
export {
    assertContentRefsExist,
    type ContentRefsReader,
} from "content/blocs/core/markup/validation/assertContentRefsExist";
export {
    managedNativeElementIssue,
    type ManagedNativeElementContract,
} from "content/blocs/core/markup/validation/managedNativeElements";
export { hardenStoredHtml } from "content/blocs/core/markup/security/hardenStoredHtml";
export { validatePageSeo } from "content/pages/core/validation/seo";
export { validatePageIndexingConfiguration } from "content/pages/core/validation/indexing";
export { isSafeNavigationalUrl } from "content/blocs/core/markup/security/safeUrl";
export { validatePagePath, validatePageTitle, validatePagePatch } from "content/pages/core/validation/page";
export { canonicalSiteBaseUrl, validateSettingsPatch } from "content/settings/core/validation";
export {
    PAGE_METADATA_PLATFORM_VARIABLES,
    PAGE_METADATA_RESERVED_NAMESPACES,
    resolvePageMetadataTemplate,
    resolvePageMetadataTemplateResult,
    type PageMetadataContext,
    type PageMetadataScalar,
    type PageMetadataScope,
    type PageMetadataTemplateResult,
} from "content/pages/core/rendering/pageMetadata";

// ── HTTP handlers (mounted by surfaces) ────────────────────────────────
export { generateStyleEntry } from "content/theme/core/generateStyleEntry";
export {
    PUBLISHED_PAGE_SNAPSHOT_ROUTE,
    PUBLISHED_PAGE_SNAPSHOT_SCHEMA,
    publishedPageSnapshotUrl,
    servePublishedPageSnapshot,
} from "content/pages/http/publishedPageSnapshot";

// ── Constants & utils ──────────────────────────────────────────────────
export * from "content/application/core/cacheKeys";
export * from "content/application/core/validation/predicates";
export * from "content/blocs/core/markup/contentRefs";
export { derivePagePath } from "content/pages/core/paths/pagePath";
export { sanitizeDomTree } from "content/blocs/core/markup/security/sanitizeDomTree";
export { sanitizeSvgTree } from "content/blocs/core/markup/security/sanitizeSvgTree";
export { escapeRegex } from "content/pages/core/queries/escapeRegex";

export { validateCapabilityRequirements } from "content/blocs/core/validation/definition/requirements";

export type { ContentCapabilityRequirement } from "content/application/interfaces/ContentCapabilityRequirement";
