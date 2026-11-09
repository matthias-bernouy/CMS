import { DEFAULT_COLLECTION_LIMITS } from "repository/collections/core/limits";

/** Authoring budgets; filesystem traversal keeps its own independent limits. */
export const AUTHORING_SOURCE_LIMITS = Object.freeze({
    snapshotBytes: 8 * 1024 * 1024,
    fileBytes: 1024 * 1024,
    assetBytes: DEFAULT_COLLECTION_LIMITS.maxAssetBytes,
    assetBundleBytes: DEFAULT_COLLECTION_LIMITS.maxBundleBytes,
    files: 16_384,
    assets: DEFAULT_COLLECTION_LIMITS.maxAssets,
    jsonDepth: 16,
});

/** Contract fixtures retain their separate binary budget. */
export const CONTRACT_SOURCE_ASSET_LIMITS = Object.freeze({
    assetBytes: 16 * 1024 * 1024,
    assetBundleBytes: 64 * 1024 * 1024,
});
