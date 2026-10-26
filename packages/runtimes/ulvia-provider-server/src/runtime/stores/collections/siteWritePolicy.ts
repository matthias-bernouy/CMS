import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { ContentRepository } from "@bernouy/cms-content";

export const CMS_REPOSITORY_FENCED_MUTATIONS = [
    "updateSiteBlocGroup",
    "createSiteBlocGroup",
    "createBloc",
    "replaceBloc",
    "createSiteBloc",
    "saveSiteBlocDraft",
    "publishSiteBloc",
    "archiveSiteBloc",
    "restoreSiteBloc",
    "insertPage",
    "updatePage",
    "deletePage",
    "setPagePaths",
    "deletePageWithAlternative",
    "updateSystem",
] as const satisfies readonly (keyof ContentRepository)[];

const CMS_REPOSITORY_NON_MUTATIONS = [
    "getContentContributions",
    "getPageRequirements",
    "getSiteBlocGroups",
    "getBlocRecord",
    "getBlocRecords",
    "withSiteBlocPublicationLock",
    "getBlocsList",
    "getBlocViewJS",
    "getBlocViewsJS",
    "getSiteBlocsRevision",
    "getBlocSource",
    "getPage",
    "getPageById",
    "getAllPages",
    "scanPages",
    "scanPagesByContentReference",
    "getPublishedPage",
    "getPublishedPageById",
    "getPublishedPagesByIds",
    "getPublishedPages",
    "getPageRoute",
    "getPageRoutes",
    "getLinks",
    "getPagesMetadata",
    "getTagCounts",
    "getSystem",
    "getSystemRevision",
] as const satisfies readonly (keyof ContentRepository)[];

export const COLLECTION_STORE_FENCED_MUTATIONS = [
    "install",
    "installMany",
    "commitUpgrade",
    "saveConfiguration",
    "uninstall",
    "saveTexts",
] as const satisfies readonly (keyof CollectionStore)[];

const COLLECTION_STORE_NON_SITE_MUTATIONS_OR_READS = [
    "importRelease",
    "admitRelease",
    "importAdmittedRelease",
    "getReleaseAsset",
    "getInstalledAssetMetadata",
    "getInstalledAssetMetadataBatch",
    "getRelease",
    "revision",
    "snapshot",
] as const satisfies readonly (keyof CollectionStore)[];

type ContentRepositoryUnclassified = Exclude<
    keyof ContentRepository,
    (typeof CMS_REPOSITORY_FENCED_MUTATIONS)[number] | (typeof CMS_REPOSITORY_NON_MUTATIONS)[number]
>;
type CollectionStoreUnclassified = Exclude<
    keyof CollectionStore,
    (typeof COLLECTION_STORE_FENCED_MUTATIONS)[number] | (typeof COLLECTION_STORE_NON_SITE_MUTATIONS_OR_READS)[number]
>;

// These assignments fail compilation as soon as a new public method is added
// without an explicit fenced/non-fenced classification above.
const contentRepositoryCoverage: Record<ContentRepositoryUnclassified, never> = {};
const collectionStoreCoverage: Record<CollectionStoreUnclassified, never> = {};
void contentRepositoryCoverage;
void collectionStoreCoverage;
