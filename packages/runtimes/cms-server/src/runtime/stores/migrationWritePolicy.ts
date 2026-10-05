import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { CmsRepository } from "@bernouy/cms-content";

export const CMS_REPOSITORY_FENCED_MUTATIONS = [
    "updateSiteBlocCollection",
    "createSiteBlocCollection",
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
] as const satisfies readonly (keyof CmsRepository)[];

const CMS_REPOSITORY_NON_MUTATIONS = [
    "getInstalledCollections",
    "getSiteBlocCollections",
    "getBlocRecord",
    "getBlocRecords",
    "withSiteBlocPublicationLock",
    "getBlocsList",
    "getBlocViewJS",
    "getBlocSource",
    "getPage",
    "getPageById",
    "getAllPages",
    "scanPages",
    "getPublishedPage",
    "getPublishedPageById",
    "getPublishedPages",
    "getPageRoute",
    "getLinks",
    "getPagesMetadata",
    "getTagCounts",
    "getSystem",
] as const satisfies readonly (keyof CmsRepository)[];

export const COLLECTION_STORE_FENCED_MUTATIONS = [
    "install",
    "installMany",
    "upgrade",
    "commitMigration",
    "restoreMigration",
    "saveConfiguration",
    "uninstall",
    "saveTexts",
] as const satisfies readonly (keyof CollectionStore)[];

const COLLECTION_STORE_NON_SITE_MUTATIONS_OR_READS = [
    "importRelease",
    "getReleaseAsset",
    "getInstalledAssetMetadata",
    "getInstalledAssetMetadataBatch",
    "getRelease",
    "snapshot",
] as const satisfies readonly (keyof CollectionStore)[];

type CmsRepositoryUnclassified = Exclude<
    keyof CmsRepository,
    (typeof CMS_REPOSITORY_FENCED_MUTATIONS)[number] | (typeof CMS_REPOSITORY_NON_MUTATIONS)[number]
>;
type CollectionStoreUnclassified = Exclude<
    keyof CollectionStore,
    (typeof COLLECTION_STORE_FENCED_MUTATIONS)[number] | (typeof COLLECTION_STORE_NON_SITE_MUTATIONS_OR_READS)[number]
>;

// These assignments fail compilation as soon as a new public method is added
// without an explicit fenced/non-fenced classification above.
const cmsRepositoryCoverage: Record<CmsRepositoryUnclassified, never> = {};
const collectionStoreCoverage: Record<CollectionStoreUnclassified, never> = {};
void cmsRepositoryCoverage;
void collectionStoreCoverage;
