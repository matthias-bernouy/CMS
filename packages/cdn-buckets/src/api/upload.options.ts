import type { StorageProvider } from "../exports/StorageProvider";
import { originAllowed, corsHeaders } from "../core/upload/cors";

/**
 * CORS preflight for `POST /upload?token=…`. Reads the token (without
 * consuming it) to look up its allowed origins, then either:
 *  - returns 204 + the matching CORS headers when the request `Origin` is
 *    in the token's allowlist;
 *  - returns 403 (no CORS headers) so the browser fails the actual POST
 *    before any bytes are sent.
 *
 * Same-origin requests skip preflight entirely; they still hit the POST
 * directly without us having a say. So this handler exists purely to
 * gate cross-origin uploads.
 */
export default async function handleUploadOptions(req: Request, provider: StorageProvider): Promise<Response> {
    const origin = req.headers.get("origin");
    const tokenId = new URL(req.url).searchParams.get("token");
    if (!tokenId) return new Response(null, { status: 400 });

    const token = await provider.preSignedTokenRepo.get(tokenId);
    if (!token || token.consumedAt || token.expiresAt.getTime() <= Date.now()) {
        return new Response(null, { status: 403 });
    }

    if (!originAllowed(origin, token.allowedOrigins)) {
        return new Response(null, { status: 403 });
    }

    return new Response(null, {
        status: 204,
        headers: {
            ...corsHeaders(origin, token.allowedOrigins),
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type, content-length",
            "Access-Control-Max-Age":       "600",
        },
    });
}
