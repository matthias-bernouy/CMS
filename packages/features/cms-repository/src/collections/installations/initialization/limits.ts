import type { InitializationLimits } from "./interfaces";

export const DEFAULT_INITIALIZATION_LIMITS: Readonly<InitializationLimits> = Object.freeze({
    maxCollections: 16,
    maxRecipes: 32,
    maxPages: 256,
    maxDepth: 8,
    maxMetadataBytes: 32 * 1024 * 1024,
    maxDeclaredAssetBytes: 32 * 1024 * 1024,
    maxContracts: 64,
});

export function initializationLimits(value: Readonly<InitializationLimits> = DEFAULT_INITIALIZATION_LIMITS) {
    for (const key of Object.keys(DEFAULT_INITIALIZATION_LIMITS) as (keyof InitializationLimits)[]) {
        if (!Number.isSafeInteger(value[key]) || value[key] < 1) {
            throw new TypeError(`Initialization limit ${key} must be a positive safe integer`);
        }
    }
    return Object.freeze({ ...value });
}
