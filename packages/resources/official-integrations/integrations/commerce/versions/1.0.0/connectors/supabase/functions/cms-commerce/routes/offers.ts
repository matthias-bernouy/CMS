import { cmsUserId, optionalCmsUserId } from "../core/auth.ts";
import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { camelize, integer, readJsonObject, requiredText, text } from "../core/records.ts";
import { one, rpc } from "../core/rest.ts";
import {
    enrichOffer, optionalId, redactOfferMetadata, requireOwnedOffer, sellerOfferPayload,
} from "./offer-helpers.ts";
import { requirePublicSeller } from "./offer/public-seller.ts";
const offerSelect = "id,seller_id,product_id,variant_id,slug,title,description,condition_code,publication_status,workflow_state,accepted_price_amount,currency,availability,quantity_available,metadata,version,created_at,updated_at";
export { listOffers } from "./offer/list.ts";

export async function getOffer(request: Request, scope: "public" | "admin" | "self"): Promise<Response> {
    const url = new URL(request.url);
    if (url.searchParams.get("id") === "__new__" && scope !== "public") {
        return json({
            id: null,
            productId: null,
            variantId: null,
            slug: "",
            title: "",
            description: "",
            conditionCode: "good",
            publicationStatus: "draft",
            workflowState: "draft",
            acceptedPriceAmount: null,
            currency: "eur",
            availability: "available",
            quantityAvailable: null,
            metadata: {},
            media: [],
            mainImageMediaId: null,
            version: 1,
        });
    }
    const id = optionalId(url.searchParams.get("id"));
    const slug = text(url.searchParams.get("slug"));
    if (id === null && !slug) throw new HttpError(400, "id or slug is required");
    const row = id !== null
        ? await one("offers", { id }, offerSelect)
        : await one("offers", { slug: slug! }, offerSelect);
    if (!row) throw new HttpError(404, "offer not found");
    if (scope === "public" && row.publication_status !== "active") throw new HttpError(404, "offer not found");
    if (scope === "public") await requirePublicSeller(String(row.seller_id));
    if (scope === "self") await requireOwnedOffer(request, row);
    const value = scope === "public" ? (await redactOfferMetadata([row]))[0]! : row;
    return json(camelize(await enrichOffer(value, scope)));
}

export async function createMyOffer(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("create_my_offer", {
        p_cms_user_id: cmsUserId(request),
        p_payload: sellerOfferPayload(body),
    });
    return json(camelize(result));
}

export async function updateMyOffer(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readJsonObject(request);
    const payload = sellerOfferPayload(body);
    if (!Object.keys(payload).length) throw new HttpError(400, "at least one offer field is required");
    const result = await rpc("update_my_offer", {
        p_offer_id: integer(url.searchParams.get("id"), "id", true),
        p_cms_user_id: cmsUserId(request),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
        p_payload: payload,
    });
    return json(camelize(result));
}

export async function submitMyOffer(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readJsonObject(request);
    const result = await rpc("submit_my_offer", {
        p_offer_id: integer(url.searchParams.get("id"), "id", true),
        p_cms_user_id: cmsUserId(request),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
    });
    return json(camelize(result));
}

export async function submitMyOfferPrice(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readJsonObject(request);
    const result = await rpc("submit_offer_price", {
        p_offer_id: integer(url.searchParams.get("id"), "id", true),
        p_cms_user_id: cmsUserId(request),
        p_amount: integer(body.amount, "amount", true),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
    });
    return json(camelize(result));
}

export async function upsertOffer(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readJsonObject(request);
    const offerId = optionalId(url.searchParams.get("id"));
    const result = await rpc("upsert_offer", {
        p_offer_id: offerId,
        p_payload: body,
        p_expected_version: integer(body.expectedVersion, "expectedVersion", offerId !== null),
        p_admin_id: optionalCmsUserId(request),
    });
    return json(camelize(result));
}

export async function reviewOffer(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await readJsonObject(request);
    const result = await rpc("review_offer", {
        p_offer_id: integer(url.searchParams.get("id"), "id", true),
        p_action: requiredText(body.action, "action"),
        p_admin_id: optionalCmsUserId(request),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
        p_minimum_amount: integer(body.minimumAmount, "minimumAmount"),
        p_maximum_amount: integer(body.maximumAmount, "maximumAmount"),
        p_reason: text(body.reason) ?? null,
    });
    return json(camelize(result));
}
