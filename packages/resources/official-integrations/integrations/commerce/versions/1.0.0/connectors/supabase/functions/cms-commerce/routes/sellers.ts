import { cmsUserId, optionalCmsUserId } from "../core/auth.ts";
import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { camelize, integer, isRecord, readJsonObject, requiredText, text } from "../core/records.ts";
import { listRows, one, rpc } from "../core/rest.ts";

const sellerSelect =
    "id,kind,cms_user_id,slug,display_name,verification_status,verified_at,verified_by,metadata,version,created_at,updated_at";
const selfSellerSelect =
    "id,kind,cms_user_id,slug,display_name,verification_status,verified_at,metadata,version,created_at,updated_at";
const sellerIdentitySelect = "id,cms_user_id";

export async function getMySeller(request: Request): Promise<Response> {
    const row = await one("sellers", { cms_user_id: cmsUserId(request) }, selfSellerSelect);
    if (!row) {
        return json({ exists: false });
    }
    return json({ exists: true, ...(camelize(row) as Record<string, unknown>) });
}

export async function getCurrentSellerIdentity(request: Request): Promise<Response> {
    const row = await one("sellers", { cms_user_id: cmsUserId(request) }, sellerIdentitySelect);
    if (!row) {
        return json({ exists: false });
    }
    return json({ exists: true, id: row.id, cmsUserId: row.cms_user_id });
}

export async function registerMySeller(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    if (body.displayName !== undefined && !text(body.displayName)) {
        throw new HttpError(400, "displayName must be text");
    }
    if (body.metadata !== undefined && !isRecord(body.metadata)) {
        throw new HttpError(400, "metadata must be an object");
    }
    const result = await rpc("register_my_seller", {
        p_cms_user_id: cmsUserId(request),
        p_display_name: text(body.displayName) ?? "Marketplace seller",
        p_metadata: isRecord(body.metadata) ? body.metadata : {},
    });
    const seller = camelize(result) as Record<string, unknown>;
    delete seller.verifiedBy;
    return json({ exists: true, ...seller });
}

export async function updateMySeller(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    if (body.metadata !== undefined && !isRecord(body.metadata)) {
        throw new HttpError(400, "metadata must be an object");
    }
    const result = await rpc("update_my_seller", {
        p_cms_user_id: cmsUserId(request),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
        p_display_name: text(body.displayName) ?? null,
        p_metadata_patch: body.metadata ?? null,
    });
    const seller = camelize(result) as Record<string, unknown>;
    delete seller.verifiedBy;
    return json({ exists: true, ...seller });
}

export async function verifyPendingSellerPayoutEligibility(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("verify_pending_seller_payout_eligibility", {
        p_cms_user_id: cmsUserId(request),
        p_seller_id: integer(body.sellerId, "sellerId", true),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
        p_provider: requiredText(body.provider, "provider"),
        p_provider_account_id: requiredText(body.providerAccountId, "providerAccountId"),
    });
    return json(camelize(result));
}

export async function listSellers(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    const params = new URLSearchParams({
        select: sellerSelect,
        order: "updated_at.desc,id.desc",
        limit: String(limit),
        offset: String(offset),
    });
    const status = text(url.searchParams.get("verificationStatus"));
    const kind = text(url.searchParams.get("kind"));
    const query = text(url.searchParams.get("q"))?.replace(/[,*()]/g, " ");
    if (status) {
        params.set("verification_status", `eq.${status}`);
    }
    if (kind) {
        params.set("kind", `eq.${kind}`);
    }
    if (query) {
        params.set("or", `(display_name.ilike.*${query}*,slug.ilike.*${query}*,cms_user_id.ilike.*${query}*)`);
    }
    const { rows, total } = await listRows(`sellers?${params.toString()}`);
    return json({ items: camelize(rows), total, limit, offset });
}

export async function getSeller(request: Request): Promise<Response> {
    const id = integer(new URL(request.url).searchParams.get("id"), "id", true)!;
    const row = await one("sellers", { id }, sellerSelect);
    if (!row) {
        throw new HttpError(404, "seller not found");
    }
    return json(camelize(row));
}

export async function reviewSeller(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readJsonObject(request);
    const result = await rpc("review_seller", {
        p_seller_id: integer(url.searchParams.get("id"), "id", true),
        p_status: requiredText(body.status, "status"),
        p_admin_id: optionalCmsUserId(request),
        p_reason: text(body.reason) ?? null,
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
    });
    return json(camelize(result));
}
