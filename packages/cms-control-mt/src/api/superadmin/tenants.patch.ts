import type { MtControlCms } from "src/exports/MtControlCms";
import { assertValidTenantId } from "src/core/validation/tenant/id";

/**
 * Updates a tenant's `delivery` block. Currently only `delivery.*` is
 * patchable — Keycloak / assetsCdn rotations require a recreate so the
 * runtime mount picks up new secrets cleanly.
 *
 * Request body (flat, like the create form):
 *   { "delivery.publicCdn.url": "...", "delivery.publicCdn.bucketCredential": "...",
 *     "delivery.alias": "acme.com", "delivery.enabled": "true" }
 */
export default async function handlePatchTenant(req: Request, mt: MtControlCms): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id");
    try { assertValidTenantId(id); }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ ok: false, error: { code: "validation_error", message } }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try { body = (await req.json()) as Record<string, unknown>; }
    catch { return Response.json({ ok: false, error: { code: "validation_error", message: "invalid JSON body" } }, { status: 400 }); }

    const url   = stringOrUndef(body["delivery.publicCdn.url"]);
    const cred  = stringOrUndef(body["delivery.publicCdn.bucketCredential"]);
    const alias = stringOrUndef(body["delivery.alias"]);
    const enabled = body["delivery.enabled"] === "true" || body["delivery.enabled"] === true;

    if (url || cred) {
        if (!url || !cred) {
            return Response.json({ ok: false, error: { code: "validation_error", message: "publicCdn url + bucketCredential must be sent together" } }, { status: 400 });
        }
    }

    const existing = await mt.tenantRepo.get(id as string);
    if (!existing) return Response.json({ ok: false, error: { code: "not_found", message: `tenant "${id}" not found` } }, { status: 404 });

    const previous = existing.delivery;
    const publicCdn = url && cred ? { url, bucketCredential: cred } : previous?.publicCdn;
    if (!publicCdn) {
        return Response.json({ ok: false, error: { code: "validation_error", message: "publicCdn is required to enable delivery" } }, { status: 400 });
    }
    const delivery = {
        publicCdn,
        ...(alias !== undefined ? { alias } : previous?.alias ? { alias: previous.alias } : {}),
        enabled,
    };

    const updated = await mt.tenantRepo.update(id as string, { delivery });
    return Response.json({ ok: true, data: { id: updated?.id, deliveryEnabled: !!updated?.delivery?.enabled } });
}

function stringOrUndef(v: unknown): string | undefined {
    if (typeof v !== "string" || v.trim() === "") return undefined;
    return v.trim();
}
