import type { ProviderManifestDigest } from "cms-repository/providers/manifests/core/admission/admitProviderManifest";

export type ProviderManifestChangeCategory =
    | "identity"
    | "metadata"
    | "implementation"
    | "requirement"
    | "endpoint"
    | "credential"
    | "configuration"
    | "build_range"
    | "data_policy"
    | "recovery_policy";

export interface ProviderManifestChange {
    readonly category: ProviderManifestChangeCategory;
    readonly kind: "added" | "removed" | "changed";
    /** Semantic path; keyed collections use IDs (and exact versions), not array positions. */
    readonly path: string;
    readonly before?: unknown;
    readonly after?: unknown;
}

export interface ProviderManifestComparison {
    readonly previousDigest: ProviderManifestDigest;
    readonly nextDigest: ProviderManifestDigest;
    readonly sameIdentity: boolean;
    /** Every change to the exact manifest digest requires explicit installation approval. */
    readonly requiresApproval: boolean;
    /** Descriptive changes only: this report makes no SemVer compatibility or conformance claim. */
    readonly changes: readonly ProviderManifestChange[];
}
