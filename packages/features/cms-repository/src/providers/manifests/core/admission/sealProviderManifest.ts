import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import type { ProviderManifest } from "cms-repository/providers/manifests/interfaces/ProviderManifest";
import { translateContractError } from "../contractErrors";
import { ProviderManifestValidationError } from "../errors";
import type { ProviderManifestLimits } from "../limits";
import type { AdmittedProviderManifest, ProviderManifestDigest } from "./admitProviderManifest";

const encoder = new TextEncoder();

/** Internal: the caller supplies an independently parsed, frozen manifest. */
export async function sealProviderManifest(
    manifest: ProviderManifest,
    limits: Readonly<ProviderManifestLimits>,
): Promise<AdmittedProviderManifest> {
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
    const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return Object.freeze({
        kind: "admitted-provider-manifest",
        manifest,
        canonicalJson,
        digest: `sha256:${hex}` as ProviderManifestDigest,
    });
}
