import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

describe("commerce seller offer listing", () => {
    test("returns display statuses, main media, filters, and pagination", async () => {
        setRestResponder(() =>
            jsonResponse({
                seller_exists: true,
                status_valid: true,
                workflow_states: [
                    { code: "draft", label: "Draft", phase: "draft", terminal: false },
                    { code: "pending_review", label: "Pending review", phase: "admin_review", terminal: false },
                    { code: "changes_requested", label: "Changes requested", phase: "seller_input", terminal: false },
                    { code: "approved", label: "Approved", phase: "ready", terminal: false },
                    { code: "rejected", label: "Rejected", phase: "terminal", terminal: true },
                    { code: "archived", label: "Archived", phase: "terminal", terminal: true },
                ],
                rows: [
                    {
                        id: 91,
                        seller_id: 7,
                        title: "First",
                        publication_status: "draft",
                        workflow_state: "pending_review",
                        publicly_visible: false,
                        accepted_price_amount: 11000,
                    },
                    {
                        id: 92,
                        seller_id: 7,
                        title: "Second",
                        publication_status: "draft",
                        workflow_state: "pending_review",
                        publicly_visible: true,
                        accepted_price_amount: 13000,
                    },
                ],
                media: [
                    { offer_id: 91, media_id: 12, sort_order: 1, is_main: false },
                    { offer_id: 91, media_id: 13, sort_order: 2, is_main: true },
                    { offer_id: 92, media_id: 14, sort_order: 1, is_main: false },
                ],
                active_price_proposals: [
                    { id: 3, offer_id: 91, amount: 12000, status: "pending", created_at: "2026-07-13T12:00:00Z" },
                    { id: 2, offer_id: 91, amount: 11000, status: "accepted", created_at: "2026-07-12T12:00:00Z" },
                ],
                total: 7,
            }),
        );

        const response = await requestCommerce("/me/offers?status=under_review&limit=2&offset=2", {
            userId: "seller-user-123",
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ total: 7, limit: 2, offset: 2 });
        expect(body.items).toEqual([
            expect.objectContaining({
                id: 91,
                acceptedPriceAmount: 11000,
                sellerDisplayPriceAmount: 12000,
                displayStatus: "under_review",
                publiclyVisible: false,
                mainImageMediaId: "13",
            }),
            expect.objectContaining({
                id: 92,
                acceptedPriceAmount: 13000,
                sellerDisplayPriceAmount: 13000,
                displayStatus: "under_review",
                publiclyVisible: true,
                mainImageMediaId: "14",
            }),
        ]);
        expect(expectSingleRpc("list_seller_offers_read_model").body).toEqual({
            p_cms_user_id: "seller-user-123",
            p_status: "under_review",
            p_limit: 2,
            p_offset: 2,
        });
    });

    test("rejects unknown display statuses", async () => {
        setRestResponder(() => jsonResponse({ seller_exists: true, status_valid: false }));

        const response = await requestCommerce("/me/offers?status=unknown", { userId: "seller-user-123" });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "status is invalid" });
        expect(expectSingleRpc("list_seller_offers_read_model").body).toEqual({
            p_cms_user_id: "seller-user-123",
            p_status: "unknown",
            p_limit: 50,
            p_offset: 0,
        });
    });
});
