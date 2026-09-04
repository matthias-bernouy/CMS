import { cmsUserId } from "../../../core/auth.ts";
import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, isRecord, text } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";

export async function listSellerOfferReadModel(
    request: Request,
    url: URL,
    limit: number,
    offset: number,
): Promise<Response> {
    const query = text(url.searchParams.get("q"))?.replace(/[,*()]/g, " ");
    const result = await rpc("list_seller_offers_read_model", {
        p_cms_user_id: cmsUserId(request),
        p_status: text(url.searchParams.get("status")),
        p_publication_status: text(url.searchParams.get("publicationStatus")),
        p_workflow_state: text(url.searchParams.get("workflowState")),
        p_condition_code: text(url.searchParams.get("conditionCode")),
        p_product_id: text(url.searchParams.get("productId")),
        p_variant_id: text(url.searchParams.get("variantId")),
        p_query: query,
        p_limit: limit,
        p_offset: offset,
    });
    if (!isRecord(result) || typeof result.seller_exists !== "boolean" || typeof result.status_valid !== "boolean") {
        throw invalidReadModel();
    }
    if (!result.seller_exists) {
        return json({ items: [], total: 0, limit, offset });
    }
    if (!result.status_valid) {
        throw new HttpError(400, "status is invalid");
    }
    const rows = recordArray(result.rows);
    const workflowStates = recordArray(result.workflow_states);
    const media = recordArray(result.media);
    const activePriceProposals = recordArray(result.active_price_proposals);
    const total = typeof result.total === "number" ? result.total : null;
    if (
        !rows ||
        !workflowStates ||
        !media ||
        !activePriceProposals ||
        total === null ||
        !Number.isFinite(total) ||
        total < 0
    ) {
        throw invalidReadModel();
    }
    const items = decorateSellerOffers(rows, workflowStates, media, activePriceProposals);
    return json({ items: camelize(items), total, limit, offset });
}

function recordArray(value: unknown): JsonRecord[] | null {
    return Array.isArray(value) && value.every(isRecord) ? value : null;
}

function decorateSellerOffers(
    rows: JsonRecord[],
    states: JsonRecord[],
    media: JsonRecord[],
    activePriceProposals: JsonRecord[],
): JsonRecord[] {
    const mediaByOffer = groupByOffer(media);
    const displayPriceByOffer = new Map<string, unknown>();
    for (const proposal of activePriceProposals) {
        const offerId = String(proposal.offer_id);
        if (!displayPriceByOffer.has(offerId)) {
            displayPriceByOffer.set(offerId, proposal.amount);
        }
    }
    const stateByCode = new Map(states.map((state) => [String(state.code), state]));
    return rows.map((row) => {
        const offerMedia = mediaByOffer.get(String(row.id)) ?? [];
        const main = offerMedia.find((item) => item.is_main === true) ?? offerMedia[0];
        const workflowState = stateByCode.get(String(row.workflow_state)) ?? null;
        return {
            ...row,
            main_image_media_id: main ? String(main.media_id) : null,
            main_image_width: main?.width ?? null,
            main_image_height: main?.height ?? null,
            display_status: sellerDisplayStatus(row, workflowState),
            seller_display_price_amount: displayPriceByOffer.get(String(row.id)) ?? row.accepted_price_amount ?? null,
            workflow_state_info: workflowState,
        };
    });
}

function groupByOffer(rows: JsonRecord[]): Map<string, JsonRecord[]> {
    const grouped = new Map<string, JsonRecord[]>();
    for (const row of rows) {
        const offerId = String(row.offer_id);
        const existing = grouped.get(offerId) ?? [];
        existing.push(row);
        grouped.set(offerId, existing);
    }
    return grouped;
}

function sellerDisplayStatus(offer: JsonRecord, state: JsonRecord | null): string {
    if (offer.publication_status === "archived" || state?.code === "archived") {
        return "archived";
    }
    if (state?.terminal === true) {
        return "rejected";
    }
    if (offer.publication_status === "active") {
        return "online";
    }
    if (offer.publication_status === "paused") {
        return "paused";
    }
    if (state?.phase === "seller_input") {
        return "action_required";
    }
    if (state?.phase === "admin_review") {
        return "under_review";
    }
    return "draft";
}

function invalidReadModel(): HttpError {
    return new HttpError(502, "list_seller_offers_read_model returned an invalid response");
}
