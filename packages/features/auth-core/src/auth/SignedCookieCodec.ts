/**
 * Stateless signed-cookie codec. HMAC-SHA256 (Web Crypto) over a base64url
 * JSON payload with an embedded `exp` — the cookie IS the state, no server-side
 * store. Browser-safe by design (`crypto.subtle`, no `node:` imports), matching
 * the rest of core. `sign`/`verify` are async (subtle is async).
 *
 * Token layout: `<base64url(payload)>.<base64url(hmac)>`. `verify` rejects a
 * bad signature (constant-time, via `subtle.verify`) or an expired payload.
 *
 * The key must carry real entropy (>= 16 bytes). Rotating it invalidates every
 * cookie in flight.
 */
export class SignedCookieCodec {

    private readonly _key: Promise<CryptoKey>;

    constructor(keyBytes: Uint8Array) {
        if (keyBytes.length < 16) throw new Error("SignedCookieCodec: key must be >= 16 bytes.");
        this._key = crypto.subtle.importKey(
            "raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
        );
    }

    async sign(payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
        const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
        const data = b64urlEncode(new TextEncoder().encode(JSON.stringify(body)));
        const key  = await this._key;
        const mac  = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data) as BufferSource);
        return `${data}.${b64urlEncode(new Uint8Array(mac))}`;
    }

    async verify<T extends object>(token: string): Promise<(T & { exp: number }) | null> {
        const dot = token.indexOf(".");
        if (dot < 0) return null;
        const data = token.slice(0, dot);
        const sig  = token.slice(dot + 1);

        try {
            // `b64urlDecode` (via `atob`) throws on malformed base64, so the
            // signature decode must sit INSIDE the try too: a junk cookie like
            // `a.@@@` must yield `null`, never propagate a DOMException out of
            // `verify` (the no-throw contract `getSubject` relies on).
            const key = await this._key;
            const ok  = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig) as BufferSource, new TextEncoder().encode(data) as BufferSource);
            if (!ok) return null;
            const body = JSON.parse(new TextDecoder().decode(b64urlDecode(data))) as T & { exp: number };
            if (typeof body.exp !== "number" || body.exp * 1000 <= Date.now()) return null;
            return body;
        } catch {
            return null;
        }
    }
}

function b64urlEncode(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
    const std = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
