import { wrapAdmin } from "../../../core/admin/wrapAdmin";
import type { BucketProxy } from "../../../interfaces/entities/BucketProxy";

/**
 * GET /admin/api/proxies/list?bucketId=<id>
 *
 * Returns the proxies with **redacted auth** — secret values are
 * stripped before serialization so an admin UI can list / display the
 * rules without exposing live tokens. Use the dedicated `auth` editor
 * (POST /admin/api/proxies) to update credentials in place.
 */
export default wrapAdmin(async (req, provider) => {
    const bucketId = new URL(req.url).searchParams.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");
    const proxies = await provider.bucketProxyRepo.list(bucketId);
    return proxies.map(redact);
});

type RedactedProxy = Omit<BucketProxy, "auth"> & { auth: RedactedAuth };
type RedactedAuth =
    | { type: 'none' }
    | { type: 'bearer';  hasToken: boolean }
    | { type: 'headers'; headers: { name: string; hasValue: boolean }[] };

function redact(p: BucketProxy): RedactedProxy {
    return {
        bucketId:   p.bucketId,
        providerId: p.providerId,
        server:     p.server,
        createdAt:  p.createdAt,
        updatedAt:  p.updatedAt,
        auth:       redactAuth(p.auth),
    };
}

function redactAuth(auth: BucketProxy["auth"]): RedactedAuth {
    if (auth.type === "none")   return { type: "none" };
    if (auth.type === "bearer") return { type: "bearer", hasToken: auth.token.length > 0 };
    return {
        type:    "headers",
        headers: auth.headers.map((h) => ({ name: h.name, hasValue: h.value.length > 0 })),
    };
}
