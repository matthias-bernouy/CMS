/**
 * SHA-256 of the input UTF-8 string, hex-encoded. Used for opaque API token
 * storage: we keep the hash, never the raw token — if the DB leaks, the
 * tokens remain unusable without a preimage break.
 */
export async function sha256HexAsync(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Cryptographically-strong random bytes, base64url-encoded (no padding).
 * `bytes = 48` gives ~256 bits of entropy which is well above any practical
 * brute-force threshold for bearer tokens.
 */
export function randomBase64Url(bytes: number): string {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    let binary = "";
    for (const b of buf) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
