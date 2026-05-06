/** Hex-encoded SHA-256 of the cleartext token, used for storage and lookup. */
export async function hashToken(cleartext: string): Promise<string> {
    const buf = new TextEncoder().encode(cleartext);
    const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}
