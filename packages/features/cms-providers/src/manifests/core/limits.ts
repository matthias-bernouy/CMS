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
