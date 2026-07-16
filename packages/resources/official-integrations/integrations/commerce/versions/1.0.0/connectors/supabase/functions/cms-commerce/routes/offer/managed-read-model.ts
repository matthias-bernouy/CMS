import { HttpError } from "../../core/errors.ts";
import { isRecord } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";

type ManagedOfferScope = "admin" | "self";

const functionName = "get_managed_offer_read_model";

export async function getManagedOfferReadModel(
    request: Request,
    scope: ManagedOfferScope,
    offerId: number | null,
    slug: string | undefined,
): Promise<JsonRecord> {
    const result = await rpc(functionName, {
        p_scope: scope,
        p_offer_id: offerId,
        p_slug: offerId === null ? slug ?? null : null,
        p_cms_user_id: scope === "self" ? cmsUserIdOrNull(request) : null,
    });
    if (!isRecord(result) || typeof result.state !== "string") throw invalidResponse();
    if (result.state === "not_found") throw new HttpError(404, "offer not found");
    if (result.state === "identity_required" && scope === "self") {
        throw new HttpError(401, "missing CMS user id");
    }
    if (result.state !== "ok" || !isRecord(result.offer)) throw invalidResponse();
    return result.offer;
}

function cmsUserIdOrNull(request: Request): string | null {
    return (request.headers.get("x-cms-user-id") ?? "").trim() || null;
}

function invalidResponse(): HttpError {
    return new HttpError(502, `${functionName} returned an invalid response`);
}
