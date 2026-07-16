import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";

installCommerceTestEnvironment();

describe("commerce seller offer listing", () => {
    test("returns display statuses, main media, filters, and pagination", async () => {
        let offersQuery = "";
        let mediaQuery = "";
        let proposalsQuery = "";
        setRestResponder(request => {
            const url = new URL(request.url);
            const table = url.pathname.split("/").at(-1);
            if (table === "sellers") return jsonResponse([{ id: 7 }]);
            if (table === "offer_workflow_states") return jsonResponse([
                { code: "draft", label: "Draft", phase: "draft", terminal: false },
                { code: "pending_review", label: "Pending review", phase: "admin_review", terminal: false },
                { code: "changes_requested", label: "Changes requested", phase: "seller_input", terminal: false },
                { code: "approved", label: "Approved", phase: "ready", terminal: false },
                { code: "rejected", label: "Rejected", phase: "terminal", terminal: true },
                { code: "archived", label: "Archived", phase: "terminal", terminal: true },
            ]);
            if (table === "offers") {
                offersQuery = url.search;
                return jsonResponse([
                    { id: 91, seller_id: 7, title: "First", publication_status: "draft", workflow_state: "pending_review", accepted_price_amount: 11000 },
                    { id: 92, seller_id: 7, title: "Second", publication_status: "draft", workflow_state: "pending_review", accepted_price_amount: 13000 },
                ], 200, { "content-range": "2-3/7" });
            }
            if (table === "offer_media") {
                mediaQuery = url.search;
                return jsonResponse([
                    { offer_id: 91, media_id: 12, sort_order: 1, is_main: false },
                    { offer_id: 91, media_id: 13, sort_order: 2, is_main: true },
                    { offer_id: 92, media_id: 14, sort_order: 1, is_main: false },
                ]);
            }
            if (table === "offer_price_proposals") {
                proposalsQuery = url.search;
                return jsonResponse([
                    { id: 3, offer_id: 91, amount: 12000, status: "pending", created_at: "2026-07-13T12:00:00Z" },
                    { id: 2, offer_id: 91, amount: 11000, status: "accepted", created_at: "2026-07-12T12:00:00Z" },
                ]);
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/me/offers?status=under_review&limit=2&offset=2", { userId: "seller-user-123" });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ total: 7, limit: 2, offset: 2 });
        expect(body.items).toEqual([
            expect.objectContaining({
                id: 91,
                acceptedPriceAmount: 11000,
                sellerDisplayPriceAmount: 12000,
                displayStatus: "under_review",
                mainImageMediaId: "13",
            }),
            expect.objectContaining({
                id: 92,
                acceptedPriceAmount: 13000,
                sellerDisplayPriceAmount: 13000,
                displayStatus: "under_review",
                mainImageMediaId: "14",
            }),
        ]);
        expect(offersQuery).toContain("seller_id=eq.7");
        expect(offersQuery).toContain("workflow_state=in.%28pending_review%29");
        expect(offersQuery).toContain("limit=2");
        expect(offersQuery).toContain("offset=2");
        expect(mediaQuery).toContain("offer_id=in.(91,92)");
        expect(proposalsQuery).toContain("offer_id=in.(91,92)");
        expect(proposalsQuery).toContain("status=in.(pending,accepted)");
        expect(proposalsQuery).toContain("order=created_at.desc,id.desc");
    });

    test("rejects unknown display statuses", async () => {
        setRestResponder(request => {
            const table = new URL(request.url).pathname.split("/").at(-1);
            if (table === "sellers") return jsonResponse([{ id: 7 }]);
            if (table === "offer_workflow_states") return jsonResponse([]);
            return jsonResponse([]);
        });

        const response = await requestCommerce("/me/offers?status=unknown", { userId: "seller-user-123" });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "status is invalid" });
    });
});
