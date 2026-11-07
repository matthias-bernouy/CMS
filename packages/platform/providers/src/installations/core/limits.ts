export interface ProviderInstallationLimits {
    readonly maxDocumentBytes: number;
    readonly maxJsonDepth: number;
    readonly maxImplementations: number;
}

export const DEFAULT_PROVIDER_INSTALLATION_LIMITS: Readonly<ProviderInstallationLimits> = Object.freeze({
    maxDocumentBytes: 512 * 1024,
    maxJsonDepth: 48,
    maxImplementations: 128,
});
