import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "cms-repository/exports/contracts/index";

export interface CollectionLimits {
    readonly maxDocumentBytes: number;
    readonly maxJsonDepth: number;
    readonly maxBlocs: number;
    readonly maxAssets: number;
    readonly maxAssetBytes: number;
    readonly maxBundleBytes: number;
    readonly maxMarkupLength: number;
    readonly maxSlots: number;
    readonly maxRequirementsPerBloc: number;
    readonly schema: Readonly<ReleaseLimits>;
}

export const DEFAULT_COLLECTION_LIMITS: Readonly<CollectionLimits> = Object.freeze({
    maxDocumentBytes: 2 * 1024 * 1024,
    maxJsonDepth: 64,
    maxBlocs: 128,
    maxAssets: 128,
    maxAssetBytes: 10 * 1024 * 1024,
    maxBundleBytes: 50 * 1024 * 1024,
    maxMarkupLength: 64 * 1024,
    maxSlots: 32,
    maxRequirementsPerBloc: 32,
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
