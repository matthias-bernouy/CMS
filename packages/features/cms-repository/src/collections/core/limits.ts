import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "cms-repository/exports/contracts/index";

export interface CollectionLimits {
    readonly maxDocumentBytes: number;
    readonly maxJsonDepth: number;
    readonly maxBlocs: number;
    readonly maxAssets: number;
    readonly maxTexts: number;
    readonly maxPages: number;
    readonly maxDependencies: number;
    readonly maxThemeCategories: number;
    readonly maxThemeTokens: number;
    readonly maxMigrations: number;
    readonly maxMigrationOperations: number;
    readonly maxAssetBytes: number;
    readonly maxBundleBytes: number;
    readonly maxMarkupLength: number;
    readonly maxSlotsPerBloc: number;
    readonly maxRequirementsPerResource: number;
    readonly maxSettingsPerBloc: number;
    readonly schema: Readonly<ReleaseLimits>;
}

export const DEFAULT_COLLECTION_LIMITS: Readonly<CollectionLimits> = Object.freeze({
    maxDocumentBytes: 8 * 1024 * 1024,
    maxJsonDepth: 64,
    maxBlocs: 512,
    maxAssets: 1_024,
    maxTexts: 4_096,
    maxPages: 256,
    maxDependencies: 128,
    maxThemeCategories: 64,
    maxThemeTokens: 4_096,
    maxMigrations: 512,
    maxMigrationOperations: 512,
    maxAssetBytes: 10 * 1024 * 1024,
    maxBundleBytes: 50 * 1024 * 1024,
    maxMarkupLength: 64 * 1024,
    maxSlotsPerBloc: 32,
    maxRequirementsPerResource: 32,
    maxSettingsPerBloc: 256,
    schema: DEFAULT_RELEASE_LIMITS,
});

export function normalizeCollectionLimits(limits: Readonly<CollectionLimits>): Readonly<CollectionLimits> {
    for (const [key, fallback] of Object.entries(DEFAULT_COLLECTION_LIMITS)) {
        const value = limits[key as keyof CollectionLimits];
        if (typeof fallback === "number" && (!Number.isSafeInteger(value) || (value as number) <= 0)) {
            throw new TypeError(`Collection limit ${key} must be a positive safe integer`);
        }
    }
    const schema = { ...limits.schema };
    for (const key of Object.keys(DEFAULT_RELEASE_LIMITS) as (keyof ReleaseLimits)[]) {
        if (!Number.isSafeInteger(schema[key]) || schema[key] <= 0) {
            throw new TypeError(`Collection schema limit ${key} must be a positive safe integer`);
        }
    }
    return Object.freeze({ ...limits, schema: Object.freeze(schema) });
}
