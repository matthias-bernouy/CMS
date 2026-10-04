import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { DEFAULT_PROVIDER_MANIFEST_LIMITS, type ProviderManifestLimits } from "../limits";
import type { ProviderManifest } from "../../interfaces/ProviderManifest";
import { parseProviderManifest, parseProviderManifestJson } from "../parsing/parseProviderManifest";
import { validateProviderManifestReferences } from "./validateProviderManifest";
import { sealProviderManifest } from "./sealProviderManifest";

declare const providerManifestDigestBrand: unique symbol;
export type ProviderManifestDigest = `sha256:${string}` & { readonly [providerManifestDigestBrand]: true };

export interface AdmittedProviderManifest {
    readonly canonicalJson: string;
    readonly digest: ProviderManifestDigest;
    readonly kind: "admitted-provider-manifest";
    readonly manifest: ProviderManifest;
}

export async function admitProviderManifest(
    value: unknown,
    catalogue: ReleaseCatalogue,
    limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
): Promise<AdmittedProviderManifest> {
    return admitParsedManifest(parseProviderManifest(value, limits), catalogue, limits);
}

export async function admitProviderManifestJson(
    input: string | Uint8Array,
    catalogue: ReleaseCatalogue,
    limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
): Promise<AdmittedProviderManifest> {
    return admitParsedManifest(parseProviderManifestJson(input, limits), catalogue, limits);
}

/** Rebuild persisted immutable identity without re-resolving mutable contract availability. */
export async function verifyStoredProviderManifestJson(
    input: string | Uint8Array,
    expectedDigest: unknown,
    limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
): Promise<AdmittedProviderManifest> {
    const admitted = await sealProviderManifest(parseProviderManifestJson(input, limits), limits);
    if (typeof expectedDigest !== "string" || admitted.digest !== expectedDigest) {
        throw new TypeError("Stored provider manifest digest mismatch");
    }
    return admitted;
}

export async function computeProviderManifestDigest(
    value: unknown,
    catalogue: ReleaseCatalogue,
    limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
): Promise<ProviderManifestDigest> {
    return (await admitProviderManifest(value, catalogue, limits)).digest;
}

export function isProviderManifestDigest(value: string): value is ProviderManifestDigest {
    return /^sha256:[0-9a-f]{64}$/.test(value);
}

async function admitParsedManifest(
    manifest: ProviderManifest,
    catalogue: ReleaseCatalogue,
    limits: Readonly<ProviderManifestLimits>,
): Promise<AdmittedProviderManifest> {
    await validateProviderManifestReferences(manifest, catalogue);
    return sealProviderManifest(manifest, limits);
}
