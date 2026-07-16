import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

describe("commerce seller offer read contract", () => {
    test("preserves the exact page, projections, nulls, ordering, and one-call budget", async () => {
        setRestResponder(() => jsonResponse(sellerBundle()));

        const response = await requestCommerce(
            "/me/offers?status=under_review&limit=2&offset=2",
            { userId: "seller-user-123" },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            items: [
                {
                    id: 92, sellerId: 7, productId: 42, variantId: null,
                    slug: "second", title: "Second", description: null,
                    conditionCode: "good", publicationStatus: "draft",
                    workflowState: "pending_review", acceptedPriceAmount: 13000,
                    currency: "eur", availability: "available", quantityAvailable: 1,
                    metadata: { privateNote: "kept for seller" }, version: 3,
                    createdAt: "2026-07-02T10:00:00Z", updatedAt: "2026-07-04T10:00:00Z",
                    mainImageMediaId: "14", displayStatus: "under_review",
                    sellerDisplayPriceAmount: 13000,
                    workflowStateInfo: {
                        code: "pending_review", label: "Pending review",
                        phase: "admin_review", terminal: false,
                    },
                },
                {
                    id: 91, sellerId: 7, productId: 41, variantId: 51,
                    slug: "first", title: "First", description: "Used racket",
                    conditionCode: "used", publicationStatus: "draft",
                    workflowState: "pending_review", acceptedPriceAmount: 11000,
                    currency: "eur", availability: "reserved", quantityAvailable: 0,
                    metadata: {}, version: 2,
                    createdAt: "2026-07-01T10:00:00Z", updatedAt: "2026-07-03T10:00:00Z",
                    mainImageMediaId: "13", displayStatus: "under_review",
                    sellerDisplayPriceAmount: 12000,
                    workflowStateInfo: {
                        code: "pending_review", label: "Pending review",
                        phase: "admin_review", terminal: false,
                    },
                },
            ],
            total: 7,
            limit: 2,
            offset: 2,
        });
        expect(expectSingleRpc("list_seller_offers_read_model").body).toEqual({
            p_cms_user_id: "seller-user-123",
            p_status: "under_review",
            p_limit: 2,
            p_offset: 2,
        });
    });

    test("returns an empty page from the single bundle call when no seller exists", async () => {
        setRestResponder(() => jsonResponse({ seller_exists: false, status_valid: true }));

        const response = await requestCommerce("/me/offers?limit=4&offset=8", {
            userId: "buyer-without-seller",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 4, offset: 8 });
        expect(expectSingleRpc("list_seller_offers_read_model").body).toEqual({
            p_cms_user_id: "buyer-without-seller",
            p_limit: 4,
            p_offset: 8,
        });
    });

    test("preserves the exact total when the requested offset is beyond the page", async () => {
        setRestResponder(() => jsonResponse({
            seller_exists: true, status_valid: true, rows: [], workflow_states: [],
            media: [], active_price_proposals: [], total: 7,
        }));

        const response = await requestCommerce("/me/offers?limit=2&offset=3000000000", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 7, limit: 2, offset: 3000000000 });
        expect(expectSingleRpc("list_seller_offers_read_model").body).toEqual({
            p_cms_user_id: "seller-user-123",
            p_limit: 2,
            p_offset: 3000000000,
        });
    });
});

function sellerBundle(): Record<string, unknown> {
    return {
        seller_exists: true,
        status_valid: true,
        rows: offers(),
        workflow_states: [
            { code: "draft", label: "Draft", phase: "draft", terminal: false },
            { code: "pending_review", label: "Pending review", phase: "admin_review", terminal: false },
            { code: "changes_requested", label: "Changes requested", phase: "seller_input", terminal: false },
            { code: "rejected", label: "Rejected", phase: "terminal", terminal: true },
            { code: "archived", label: "Archived", phase: "terminal", terminal: true },
        ],
        media: [
            { offer_id: 92, media_id: 14, sort_order: 1, is_main: false },
            { offer_id: 92, media_id: 15, sort_order: 1, is_main: false },
            { offer_id: 91, media_id: 12, sort_order: 1, is_main: false },
            { offer_id: 91, media_id: 13, sort_order: 2, is_main: true },
        ],
        active_price_proposals: [
            { id: 3, offer_id: 91, amount: 12000, status: "pending", created_at: "2026-07-05T10:00:00Z" },
            { id: 2, offer_id: 91, amount: 11000, status: "accepted", created_at: "2026-07-05T10:00:00Z" },
        ],
        total: 7,
    };
}

function offers(): Record<string, unknown>[] {
    return [
        { id: 92, seller_id: 7, product_id: 42, variant_id: null, slug: "second", title: "Second", description: null, condition_code: "good", publication_status: "draft", workflow_state: "pending_review", accepted_price_amount: 13000, currency: "eur", availability: "available", quantity_available: 1, metadata: { privateNote: "kept for seller" }, version: 3, created_at: "2026-07-02T10:00:00Z", updated_at: "2026-07-04T10:00:00Z" },
        { id: 91, seller_id: 7, product_id: 41, variant_id: 51, slug: "first", title: "First", description: "Used racket", condition_code: "used", publication_status: "draft", workflow_state: "pending_review", accepted_price_amount: 11000, currency: "eur", availability: "reserved", quantity_available: 0, metadata: {}, version: 2, created_at: "2026-07-01T10:00:00Z", updated_at: "2026-07-03T10:00:00Z" },
    ];
}
