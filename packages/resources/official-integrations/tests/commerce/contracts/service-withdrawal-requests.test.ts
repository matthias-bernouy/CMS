import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../harness";

installCommerceTestEnvironment();

const requestPublicId = "019c0000-0000-7000-8000-000000000042";

describe("marketplace service withdrawal request contracts", () => {
    test("submits an explicitly confirmed request with server-derived buyer identity", async () => {
        setRestResponder(() => jsonResponse({ id: 7, idempotent_replay: false }));
        const response = await requestCommerce("/me/order/service-withdrawal-requests", {
            userId: "buyer-42",
            body: {
                orderId: 42,
                buyerCmsUserId: "spoofed",
                serviceScope: "marketplace.buyer_service",
                confirmed: true,
                idempotencyKey: "withdrawal-click-42",
            },
        });

        expect(response.status).toBe(201);
        expect(expectSingleRpc("submit_marketplace_service_withdrawal_request").body).toEqual({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-42",
            p_service_scope: "marketplace.buyer_service",
            p_reason: null,
            p_confirmed: true,
            p_idempotency_key: "withdrawal-click-42",
        });
    });

    test("requires an authenticated buyer and affirmative confirmation before RPC", async () => {
        for (const options of [
            { body: { orderId: 42, serviceScope: "marketplace.service", idempotencyKey: "key", confirmed: false } },
            { userId: "buyer-42", body: { orderId: 42, serviceScope: "marketplace.service", idempotencyKey: "key" } },
        ]) {
            const response = await requestCommerce("/me/order/service-withdrawal-requests", options);
            expect(response.status).toBe(400);
        }
        const missingBuyer = await requestCommerce("/me/order/service-withdrawal-requests", {
            body: {
                orderId: 42,
                serviceScope: "marketplace.service",
                idempotencyKey: "key",
                confirmed: true,
            },
        });
        expect(missingBuyer.status).toBe(401);
        expect(capturedFetches()).toHaveLength(0);
    });

    test("scopes buyer reads on the server and ignores a buyer filter from the URL", async () => {
        setRestResponder(() => jsonResponse({ items: [], total: 0, limit: 25, offset: 2 }));
        const response = await requestCommerce(
            `/me/order/service-withdrawal-requests?buyerCmsUserId=spoofed&requestPublicId=${requestPublicId}` +
                "&orderId=42&status=submitted&serviceScope=marketplace.service&limit=25&offset=2",
            { userId: "buyer-42" },
        );

        expect(response.status).toBe(200);
        expect(expectSingleRpc("list_marketplace_service_withdrawal_requests").body).toEqual({
            p_access_buyer_cms_user_id: "buyer-42",
            p_buyer_cms_user_id: null,
            p_request_public_id: requestPublicId,
            p_order_id: 42,
            p_status: "submitted",
            p_service_scope: "marketplace.service",
            p_limit: 25,
            p_offset: 2,
        });
    });

    test("exposes the review queue to admins and keeps its buyer filter explicit", async () => {
        setRestResponder(() => jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }));
        const response = await requestCommerce(
            "/admin/service-withdrawal-requests?buyerCmsUserId=buyer-42&status=under_review",
            { userRole: "admin" },
        );

        expect(response.status).toBe(200);
        expect(expectSingleRpc("list_marketplace_service_withdrawal_requests").body).toMatchObject({
            p_access_buyer_cms_user_id: null,
            p_buyer_cms_user_id: "buyer-42",
            p_status: "under_review",
        });
        const forbidden = await requestCommerce("/admin/service-withdrawal-requests", {
            userRole: "support",
        });
        expect(forbidden.status).toBe(403);
    });

    test("forwards an admin CAS review without accepting a client actor", async () => {
        const response = await requestCommerce("/admin/service-withdrawal-request/review", {
            userId: "admin-9",
            userRole: "admin",
            body: {
                requestPublicId: requestPublicId.toUpperCase(),
                nextStatus: "resolved",
                resolution: "accepted",
                note: "Eligibility reviewed; manual processing remains separate.",
                expectedVersion: 3,
                actorId: "spoofed",
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("review_marketplace_service_withdrawal_request").body).toEqual({
            p_request_public_id: requestPublicId,
            p_next_status: "resolved",
            p_resolution: "accepted",
            p_actor_id: "admin-9",
            p_note: "Eligibility reviewed; manual processing remains separate.",
            p_expected_version: 3,
        });
    });

    test("fails closed on malformed review identity and request ids", async () => {
        const malformed = await requestCommerce("/admin/service-withdrawal-request/review", {
            userId: "admin-9",
            userRole: "admin",
            body: {
                requestPublicId: "not-a-uuid",
                nextStatus: "under_review",
                note: "Review started.",
                expectedVersion: 1,
            },
        });
        const missingActor = await requestCommerce("/admin/service-withdrawal-request/review", {
            userRole: "admin",
            body: {
                requestPublicId,
                nextStatus: "under_review",
                note: "Review started.",
                expectedVersion: 1,
            },
        });
        expect(malformed.status).toBe(400);
        expect(missingActor.status).toBe(401);
        expect(capturedFetches()).toHaveLength(0);
    });
});
