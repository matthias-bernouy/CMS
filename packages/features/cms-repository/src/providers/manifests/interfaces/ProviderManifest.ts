import type { ReleaseDigest } from "cms-repository/exports/contracts/index";
import type { UlviaObjectSchema } from "cms-repository/exports/contracts/schema";
import type { VersionRange } from "../core/versioning/versionRange";

export type ProviderCredentialSecretType = "password" | "private-key" | "token";

export interface ProviderManifestProvenance {
    readonly publishedAt: string;
    readonly publisherId: string;
}

export interface ProviderEndpointPolicy {
    readonly allowedOrigins: readonly string[];
    readonly defaultOrigin?: string;
}

export interface ProviderCredentialSlot {
    readonly id: string;
    readonly label: string;
    readonly required: boolean;
    readonly secretType: ProviderCredentialSecretType;
}

export interface ProviderCapabilityRequirement {
    readonly capabilityId: string;
    readonly contractId: string;
    readonly optional: boolean;
    readonly versionRange: VersionRange;
}

export interface ProviderContractImplementation {
    readonly contractId: string;
    readonly digest: ReleaseDigest;
    readonly requires: readonly ProviderCapabilityRequirement[];
    readonly version: string;
}

export interface ProviderDataPolicy {
    readonly residency: readonly string[];
    readonly retentionPolicyUrl?: string;
}

export interface ProviderRecoveryPolicy {
    readonly backupFormatVersion: string;
    readonly compatibleBuildRange: VersionRange;
    readonly relocation: boolean;
    readonly restore: boolean;
}

export interface ProviderManifest {
    readonly buildVersionRange: VersionRange;
    readonly configuration: UlviaObjectSchema;
    readonly credentialSlots: readonly ProviderCredentialSlot[];
    readonly dataPolicy: ProviderDataPolicy;
    readonly endpoint: ProviderEndpointPolicy;
    readonly implementations: readonly ProviderContractImplementation[];
    readonly kind: "provider-manifest";
    readonly name: string;
    readonly protocol: "ulvia-provider/v1";
    readonly provenance: ProviderManifestProvenance;
    readonly providerId: string;
    readonly recovery?: ProviderRecoveryPolicy;
    readonly schemaDialect: "ulvia-schema/v1";
    readonly version: string;
}
