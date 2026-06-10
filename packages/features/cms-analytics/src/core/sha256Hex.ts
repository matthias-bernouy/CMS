/**
 * SHA-256 of the input UTF-8 string, hex-encoded. Used to derive the
 * cookieless visitor id: we keep the digest, never the raw
 * salt+IP+user-agent input.
 */
export async function sha256HexAsync(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
