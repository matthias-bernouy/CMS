import type { OriginProvider } from "../../exports/OriginProvider";
import { authenticateEdge } from "../../core/edge/authenticateEdge";
import { computeSecretsResponse } from "../../core/edge/computeSecretsResponse";

/**
 * `GET /edge-api/secrets`
 *
 * Conditional GET — supports `If-None-Match: "<etag>"`. Auth via
 * `Authorization: Bearer <edge-token>`; lookup by `tokenHash` on
 * `EdgeRepository`. Body is `{ etag, manifest: { SECRET_xxx: plaintext } }`,
 * which the edge feeds to `envsubst` at reload time.
 *
 * The plaintext secrets travel here in the response body — the connection
 * MUST be TLS in production. Origins reachable only from edges through a
 * private network can drop TLS, but it's still recommended.
 */
export default async function (req: Request, provider: OriginProvider): Promise<Response> {
    const edge = await authenticateEdge(req, provider.edgeRepo);
    if (!edge) {
        return Response.json(
            { ok: false, error: { code: "unauthorized", message: "Invalid or missing edge token." } },
            { status: 401 },
        );
    }

    const { manifest, etag } = await computeSecretsResponse(provider.bucketProxyRepo);

    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && stripQuotes(ifNoneMatch) === etag) {
        return new Response(null, { status: 304, headers: { ETag: `"${etag}"` } });
    }

    return Response.json(
        { etag, manifest },
        { status: 200, headers: { ETag: `"${etag}"` } },
    );
}

function stripQuotes(s: string): string {
    return s.replace(/^"(.*)"$/, "$1");
}
