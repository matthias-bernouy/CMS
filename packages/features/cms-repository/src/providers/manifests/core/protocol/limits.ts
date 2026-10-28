export interface ProviderManifestLimits {
    readonly maxAllowedOrigins: number;
    readonly maxCredentialSlots: number;
    readonly maxDocumentBytes: number;
    readonly maxImplementations: number;
    readonly maxJsonDepth: number;
    readonly maxRequirementsPerImplementation: number;
}

export const DEFAULT_PROVIDER_MANIFEST_LIMITS: Readonly<ProviderManifestLimits> = Object.freeze({
    maxAllowedOrigins: 16,
    maxCredentialSlots: 32,
    maxDocumentBytes: 512 * 1024,
    maxImplementations: 128,
    maxJsonDepth: 48,
    maxRequirementsPerImplementation: 128,
});

export function normalizeProviderManifestLimits(
    limits: Readonly<ProviderManifestLimits>,
): Readonly<ProviderManifestLimits> {
    const snapshot = { ...limits };
    for (const key of Object.keys(DEFAULT_PROVIDER_MANIFEST_LIMITS) as (keyof ProviderManifestLimits)[]) {
        const minimum = key === "maxDocumentBytes" || key === "maxJsonDepth" ? 1 : 0;
        if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] < minimum) {
            throw new TypeError(`${key} must be a safe integer greater than or equal to ${minimum}`);
        }
    }
    return Object.freeze(snapshot);
}
