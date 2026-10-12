export { HttpCollectionRepository } from "cms-repository/collections/sources/http";
export {
    COLLECTION_ASSETS_ROUTE,
    collectionAssetRepresentationVersion,
    resolveInstalledCollectionAssets,
    serveInstalledCollectionAsset,
    type InstalledCollectionAssetSource,
} from "cms-repository/collections/http/installedAssets";
export { createCollectionMaintenanceGuard } from "cms-repository/collections/http/maintenance";
