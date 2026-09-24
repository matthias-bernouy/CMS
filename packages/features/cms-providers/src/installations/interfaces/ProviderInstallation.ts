import type { ProviderManifestDigest } from "cms-providers/manifests/core/admission/admitProviderManifest";

/** Administrative intent, not live health or readiness of every implemented contract. */
export type ProviderInstallationStatus = "enabled" | "disabled" | "revoked";

export interface ProviderManifestApproval {
    readonly manifestVersion: string;
    readonly manifestDigest: ProviderManifestDigest;
    readonly approvedAt: string;
    readonly approvedBy: string;
}

/** Persisted, explicitly approved link. Draft/probe workflow and raw credentials are separate. */
export interface ProviderInstallation {
    readonly id: string;
    readonly siteId: string;
    readonly providerId: string;
    readonly accountId: string;
    readonly endpoint: string;
    readonly status: ProviderInstallationStatus;
    readonly approval: ProviderManifestApproval;
    readonly providerTokenRef: string;
    /** Separate provider-to-CMS credential; its presence grants no capabilities by itself. */
    readonly gatewayTokenRef?: string;
    readonly configuration: Readonly<Record<string, unknown>>;
    readonly createdAt: string;
    readonly updatedAt: string;
}
