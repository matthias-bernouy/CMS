import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { integer, isRecord } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";

type ManagedOfferScope = "admin" | "self";

const managedFunctionName = "get_managed_offer_read_model";
const negotiationFunctionName = "get_offer_negotiation_context";
const negotiationContextFields = [
    "offer_id", "offer_slug", "offer_title", "seller_cms_user_id",
    "seller_display_name", "reference_amount", "currency",
    "publication_status", "availability",
] as const;

export async function getManagedOfferReadModel(
    request: Request,
    scope: ManagedOfferScope,
    offerId: number | null,
    slug: string | undefined,
): Promise<JsonRecord> {
    const result = await rpc(managedFunctionName, {
        p_scope: scope,
        p_offer_id: offerId,
        p_slug: offerId === null ? slug ?? null : null,
        p_cms_user_id: scope === "self" ? cmsUserIdOrNull(request) : null,
    });
    if (!isRecord(result) || typeof result.state !== "string") {
        throw invalidResponse(managedFunctionName);
    }
    if (result.state === "not_found") throw new HttpError(404, "offer not found");
    if (result.state === "identity_required" && scope === "self") {
        throw new HttpError(401, "missing CMS user id");
    }
    if (result.state !== "ok" || !isRecord(result.offer)) {
        throw invalidResponse(managedFunctionName);
    }
    return result.offer;
}

export async function getOfferNegotiationContext(request: Request): Promise<Response> {
    const offerId = integer(
        new URL(request.url).searchParams.get("offerId"),
        "offerId",
        true,
    )!;
    const result = await rpc(negotiationFunctionName, { p_offer_id: offerId });
    if (!isRecord(result) || typeof result.state !== "string") {
        throw invalidResponse(negotiationFunctionName);
    }
    if (result.state === "not_found") throw new HttpError(404, "offer not found");
    if (result.state === "seller_not_found") throw new HttpError(404, "seller not found");
    if (result.state !== "ok") throw invalidResponse(negotiationFunctionName);
    return json(projectNegotiationContext(result.context));
}

function cmsUserIdOrNull(request: Request): string | null {
    return (request.headers.get("x-cms-user-id") ?? "").trim() || null;
}

function projectNegotiationContext(value: unknown): JsonRecord {
    if (
        !isRecord(value)
        || negotiationContextFields.some(field => !Object.hasOwn(value, field))
        || !Number.isSafeInteger(value.offer_id)
        || typeof value.offer_slug !== "string"
        || typeof value.offer_title !== "string"
        || (value.seller_cms_user_id !== null
            && typeof value.seller_cms_user_id !== "string")
        || typeof value.seller_display_name !== "string"
        || (value.reference_amount !== null
            && !Number.isSafeInteger(value.reference_amount))
        || typeof value.currency !== "string"
        || typeof value.publication_status !== "string"
        || typeof value.availability !== "string"
    ) {
        throw invalidResponse(negotiationFunctionName);
    }
    return {
        offerId: value.offer_id,
        offerSlug: value.offer_slug,
        offerTitle: value.offer_title,
        sellerCmsUserId: value.seller_cms_user_id,
        sellerDisplayName: value.seller_display_name,
        referenceAmount: value.reference_amount,
        currency: value.currency,
        publicationStatus: value.publication_status,
        availability: value.availability,
    };
}

function invalidResponse(functionName: string): HttpError {
    return new HttpError(502, `${functionName} returned an invalid response`);
}
