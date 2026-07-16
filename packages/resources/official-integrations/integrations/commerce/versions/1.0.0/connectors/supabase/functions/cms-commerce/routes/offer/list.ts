import { json } from "../../core/http.ts";
import { HttpError } from "../../core/errors.ts";
import { camelize, integer, text } from "../../core/records.ts";
import { listRows, one, restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { addFilter } from "../offer-helpers.ts";
import { cmsUserId } from "../../core/auth.ts";
import { hasContextualFilters, listContextualOffers } from "./contextual-list.ts";
import { listPublicOfferReadModel } from "./public-read-model.ts";

const offerSelect = "id,seller_id,product_id,variant_id,slug,title,description,condition_code,publication_status,workflow_state,accepted_price_amount,currency,availability,quantity_available,metadata,version,created_at,updated_at";

export async function listOffers(request: Request, scope: "public" | "admin" | "self"): Promise<Response> {
    const url = new URL(request.url);
    if (scope === "public" && hasContextualFilters(url)) return await listContextualOffers(url);
    const limit = Math.min(Math.max(integer(url.searchParams.get("limit"), "limit") ?? 50, 1), 100);
    const offset = Math.max(integer(url.searchParams.get("offset"), "offset") ?? 0, 0);
    if (scope === "public") return await listPublicOfferReadModel(url, limit, offset);
    const params = new URLSearchParams({ select: offerSelect, order: "updated_at.desc,id.desc", limit: String(limit), offset: String(offset) });
    if (scope === "self") {
        const seller = await one("sellers", { cms_user_id: cmsUserId(request) }, "id");
        if (!seller) return json({ items: [], total: 0, limit, offset });
        params.set("seller_id", `eq.${String(seller.id)}`);
    }
    const workflowStates = scope === "self" ? await listWorkflowStates() : [];
    addFilter(params, "publication_status", url.searchParams.get("publicationStatus"), true);
    addFilter(params, "workflow_state", url.searchParams.get("workflowState"), true);
    if (scope === "self") applySellerStatusFilter(params, url.searchParams.get("status"), workflowStates);
    addFilter(params, "condition_code", url.searchParams.get("conditionCode"), true);
    addFilter(params, "product_id", url.searchParams.get("productId"), true);
    addFilter(params, "variant_id", url.searchParams.get("variantId"), true);
    addFilter(params, "seller_id", url.searchParams.get("sellerId"), scope !== "self");
    const query = text(url.searchParams.get("q"))?.replace(/[,*()]/g, " ");
    if (query) params.set("or", `(title.ilike.*${query}*,slug.ilike.*${query}*)`);
    const { rows, total } = await listRows(`offers?${params.toString()}`);
    if (scope === "self") {
        const items = await decorateSellerOffers(rows, workflowStates);
        return json({ items: camelize(items), total, limit, offset });
    }
    return json({ items: camelize(rows), total, limit, offset });
}

async function listWorkflowStates(): Promise<JsonRecord[]> {
    return await restJson<JsonRecord[]>(
        "offer_workflow_states?select=code,label,phase,terminal&order=position.asc,code.asc",
    );
}

function applySellerStatusFilter(params: URLSearchParams, value: string | null, states: JsonRecord[]): void {
    const status = text(value) ?? "all";
    if (status === "all") return;
    if (status === "online") return void params.set("publication_status", "eq.active");
    if (status === "paused") return void params.set("publication_status", "eq.paused");
    if (status === "archived") {
        const codes = codesFor(states, state => state.code === "archived");
        params.set("or", codes.length
            ? `(publication_status.eq.archived,workflow_state.in.(${codes.join(",")}))`
            : "(publication_status.eq.archived)");
        return;
    }
    if (status === "rejected") return void setWorkflowFilter(params, codesFor(states, state => state.terminal === true && state.code !== "archived"));
    if (status === "action_required") return void setWorkflowFilter(params, codesFor(states, state => state.phase === "seller_input"));
    if (status === "under_review") return void setWorkflowFilter(params, codesFor(states, state => state.phase === "admin_review"));
    if (status === "draft") return void setWorkflowFilter(params, codesFor(states, state => state.phase === "draft" || state.phase === "ready"));
    throw new HttpError(400, "status is invalid");
}

function setWorkflowFilter(params: URLSearchParams, codes: string[]): void {
    if (!codes.length) {
        params.set("workflow_state", "eq.__none__");
        return;
    }
    params.set("workflow_state", `in.(${codes.join(",")})`);
}

function codesFor(states: JsonRecord[], predicate: (state: JsonRecord) => boolean): string[] {
    return states.filter(predicate).map(state => String(state.code));
}

async function decorateSellerOffers(rows: JsonRecord[], states: JsonRecord[]): Promise<JsonRecord[]> {
    if (!rows.length) return [];
    const offerIds = rows.map(row => String(row.id));
    const [media, activePriceProposals] = await Promise.all([
        restJson<JsonRecord[]>(
            `offer_media?select=offer_id,media_id,sort_order,is_main&offer_id=in.(${offerIds.join(",")})&order=sort_order.asc,id.asc`,
        ),
        restJson<JsonRecord[]>(
            `offer_price_proposals?select=id,offer_id,amount,status,created_at&offer_id=in.(${offerIds.join(",")})&status=in.(pending,accepted)&order=created_at.desc,id.desc`,
        ),
    ]);
    const mediaByOffer = new Map<string, JsonRecord[]>();
    for (const item of media) {
        const offerId = String(item.offer_id);
        const existing = mediaByOffer.get(offerId) ?? [];
        existing.push(item);
        mediaByOffer.set(offerId, existing);
    }
    const displayPriceByOffer = new Map<string, unknown>();
    for (const proposal of activePriceProposals) {
        const offerId = String(proposal.offer_id);
        if (!displayPriceByOffer.has(offerId)) displayPriceByOffer.set(offerId, proposal.amount);
    }
    const stateByCode = new Map(states.map(state => [String(state.code), state]));
    return rows.map(row => {
        const offerMedia = mediaByOffer.get(String(row.id)) ?? [];
        const main = offerMedia.find(item => item.is_main === true) ?? offerMedia[0];
        const workflowState = stateByCode.get(String(row.workflow_state)) ?? null;
        return {
            ...row,
            main_image_media_id: main ? String(main.media_id) : null,
            display_status: sellerDisplayStatus(row, workflowState),
            seller_display_price_amount: displayPriceByOffer.get(String(row.id)) ?? row.accepted_price_amount ?? null,
            workflow_state_info: workflowState,
        };
    });
}

function sellerDisplayStatus(offer: JsonRecord, state: JsonRecord | null): string {
    if (offer.publication_status === "archived" || state?.code === "archived") return "archived";
    if (state?.terminal === true) return "rejected";
    if (offer.publication_status === "active") return "online";
    if (offer.publication_status === "paused") return "paused";
    if (state?.phase === "seller_input") return "action_required";
    if (state?.phase === "admin_review") return "under_review";
    return "draft";
}
