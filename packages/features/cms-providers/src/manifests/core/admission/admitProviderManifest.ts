import type { ReleaseCatalogue } from "@bernouy/cms-contracts/catalogue";
import { canonicalizeIJson } from "@bernouy/cms-contracts/protocol";
import { translateContractError } from "../contractErrors";
import { ProviderManifestValidationError } from "../errors";
import { DEFAULT_PROVIDER_MANIFEST_LIMITS, type ProviderManifestLimits } from "../limits";
import type { ProviderManifest } from "../../interfaces/ProviderManifest";
import { parseProviderManifest, parseProviderManifestJson } from "../parsing/parseProviderManifest";
import { validateProviderManifestReferences } from "./validateProviderManifest";

declare const providerManifestDigestBrand: unique symbol;
export type ProviderManifestDigest = `sha256:${string}` & { readonly [providerManifestDigestBrand]: true };

export interface AdmittedProviderManifest {
    readonly canonicalJson: string;
    readonly digest: ProviderManifestDigest;
    readonly kind: "admitted-provider-manifest";
    readonly manifest: ProviderManifest;
}

const encoder = new TextEncoder();

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
    let canonicalJson: string;
    try {
        canonicalJson = canonicalizeIJson(manifest, limits.maxJsonDepth);
    } catch (error) {
        translateContractError(error);
    }
    const bytes = encoder.encode(canonicalJson);
    if (bytes.byteLength > limits.maxDocumentBytes) {
        throw new ProviderManifestValidationError(
            "body_limit_exceeded",
            `canonical manifest exceeds ${limits.maxDocumentBytes} bytes`,
        );
    }
    const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
    return Object.freeze({
        kind: "admitted-provider-manifest",
        manifest,
        canonicalJson,
        digest: `sha256:${hex(new Uint8Array(hash))}` as ProviderManifestDigest,
    });
}

function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
