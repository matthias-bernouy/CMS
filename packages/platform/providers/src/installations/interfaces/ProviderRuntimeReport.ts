import type { ReleaseDigest } from "@bernouy/ulvia-contracts";
import type { ProviderManifestDigest } from "ulvia-providers/manifests/core/admission/admitProviderManifest";

export type ProviderRuntimeImplementationStatus = "ready" | "setup-required" | "unavailable";

export interface ProviderRuntimeImplementation {
    readonly contractId: string;
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly status: ProviderRuntimeImplementationStatus;
}

/** An observation of one remote account, never an authority or a site selection. */
export interface ProviderRuntimeReport {
    readonly protocol: "ulvia-provider/v1";
    readonly providerId: string;
    /** Provider-owned opaque audience identifying this exact runtime instance. */
    readonly instanceId: string;
    readonly account: {
        readonly id: string;
        readonly label: string;
    };
    readonly buildVersion: string;
    readonly manifest: {
        readonly version: string;
        readonly digest: ProviderManifestDigest;
    };
    /** Missing implementations remain unobserved; they do not change site pins. */
    readonly implementations: readonly ProviderRuntimeImplementation[];
}

/** The CMS owns the observation timestamp; it is not a claim from the provider. */
export interface ProviderRuntimeObservation {
    readonly observedAt: string;
    readonly report: ProviderRuntimeReport;
}
