import { canonicalJsonBytes } from "./canonical/canonicalizeJson";

const utf8 = new TextEncoder();

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
    const bytes = typeof value === "string" ? utf8.encode(value) : Uint8Array.from(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest));
}

export async function computeIntegrationPackageDigest(envelope: unknown): Promise<string> {
    return sha256Hex(canonicalJsonBytes(envelope));
}
