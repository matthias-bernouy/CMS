export type Sha256Digest = `sha256:${string}`;

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export function isSha256Digest(value: unknown): value is Sha256Digest {
    return typeof value === "string" && SHA256_DIGEST_PATTERN.test(value);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Digest(bytes: Uint8Array): Promise<Sha256Digest> {
    return `sha256:${await sha256Hex(bytes)}`;
}

/**
 * Lossless, URL-safe identity of every response-relevant property. The content
 * digest already supplies cryptographic identity, so hashing the tuple again
 * would add latency without strengthening it.
 */
export function binaryRepresentationFingerprint(input: {
    digest: Sha256Digest;
    byteLength: number;
    mediaType: string;
}): string {
    if (!isSha256Digest(input.digest)) {
        throw new TypeError("digest must be a canonical SHA-256 digest");
    }
    if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 0) {
        throw new RangeError("byte length must be a non-negative safe integer");
    }
    const mediaTypeHex = Array.from(new TextEncoder().encode(input.mediaType), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
    return `v1-${input.digest.slice("sha256:".length)}-${input.byteLength.toString(36)}-${mediaTypeHex}`;
}
