/**
 * Hex-encoded SHA-256 digest. Built on Web Crypto so the helper stays
 * portable (no Node `crypto` import). Used by the builder to hash final
 * HTML bytes (skip-upload short-circuit), the repo state fingerprint
 * stored in the manifest, and image variant payloads.
 */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
    const raw = typeof input === "string" ? new TextEncoder().encode(input) : input;
    // Force a fresh ArrayBuffer-backed view: the `digest` overload accepts
    // `BufferSource`, but TS 5.7+ types `Uint8Array<ArrayBufferLike>` whose
    // backing buffer might be a `SharedArrayBuffer`. Copying into a plain
    // `Uint8Array(length)` gives us `Uint8Array<ArrayBuffer>` unambiguously.
    const view = new Uint8Array(raw.byteLength);
    view.set(raw);
    const digest = await crypto.subtle.digest("SHA-256", view);
    const out = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < out.length; i++) {
        hex += out[i]!.toString(16).padStart(2, "0");
    }
    return hex;
}
