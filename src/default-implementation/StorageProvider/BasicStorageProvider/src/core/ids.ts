/** Opaque, URL-safe id used for files, folders, credentials, pre-signed tokens. */
export function generateId(): string {
    return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Cleartext bearer secret for a `BucketCredential`. 32 random bytes encoded
 * base64url, with a `bsp_` prefix so secrets are easy to grep in logs.
 */
export function generateCredentialToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return "bsp_" + base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
