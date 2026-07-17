import { describe, expect, test } from "bun:test";
import { expectSingleRpc, installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";

installCommerceTestEnvironment();

describe("commerce protected C2C claims and refunds", () => {
    test("opens a claim for the authenticated buyer only", async () => {
        const response = await requestCommerce("/me/order/claim", {
            userId: "buyer-17",
            body: {
                orderId: 42,
                buyerCmsUserId: "spoofed",
                reason: "not_as_described",
                description: "The item differs from the listing.",
                requestedAmount: 8_000,
            },
        });

        expect(response.status).toBe(201);
        expect(expectSingleRpc("open_marketplace_claim").body).toEqual({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-17",
            p_reason: "not_as_described",
            p_description: "The item differs from the listing.",
            p_requested_amount: 8_000,
        });
    });

    test("keeps business key and financial allocation inside Commerce", async () => {
        const response = await requestCommerce("/admin/order/refund", {
            userId: "admin-7",
            userRole: "admin",
            body: {
                orderId: 42,
                reason: "admin_resolution",
                amount: 8_000,
                protectionFeeRefundAmount: 400,
                sellerRecoveryAmount: 7_600,
                businessKey: "attacker-controlled-key",
            },
        });

        expect(response.status).toBe(201);
        expect(expectSingleRpc("request_order_refund").body).toEqual({
            p_order_id: 42,
            p_reason: "admin_resolution",
            p_requested_amount: 8_000,
            p_actor_kind: "admin",
            p_actor_id: "admin-7",
        });
    });

    test("requires optimistic concurrency when an admin reviews a refund", async () => {
        const response = await requestCommerce("/admin/refund/review", {
            userId: "admin-7",
            userRole: "admin",
            body: {
                refundRequestId: 19,
                decision: "approved",
                reason: "evidence reviewed",
            },
        });

        expect(response.status).toBe(400);
    });

    test("forwards exact claim allocation and version to the atomic resolver", async () => {
        const response = await requestCommerce("/admin/claim/resolve", {
            userId: "admin-9",
            userRole: "admin",
            body: {
                claimId: 7,
                outcome: "split",
                buyerRefundAmount: 4_000,
                sellerTransferAmount: 5_500,
                protectionFeeRefundAmount: 250,
                decisionReason: "partial mismatch",
                expectedVersion: 3,
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("resolve_marketplace_claim").body).toEqual({
            p_claim_id: 7,
            p_outcome: "split",
            p_buyer_refund_amount: 4_000,
            p_seller_transfer_amount: 5_500,
            p_protection_fee_refund_amount: 250,
            p_decision_reason: "partial mismatch",
            p_actor_kind: "admin",
            p_actor_id: "admin-9",
            p_expected_version: 3,
        });
    });

    test("records shipment recovery as an admin action", async () => {
        const response = await requestCommerce("/admin/order/shipment-creation/recover", {
            userId: "admin-11",
            userRole: "admin",
            body: {
                orderPublicId: "order-public-42",
                providerReference: "shipment-ref-42",
                providerShipmentId: "shipment-42",
                providerSnapshot: { status: "created" },
                reason: "provider outcome reconciled",
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("recover_order_shipment_creation").body).toEqual({
            p_order_public_id: "order-public-42",
            p_provider_reference: "shipment-ref-42",
            p_provider_shipment_id: "shipment-42",
            p_provider_snapshot: { status: "created" },
            p_actor_kind: "admin",
            p_actor_id: "admin-11",
            p_reason: "provider outcome reconciled",
        });
    });

    test("keeps cancellation identity server-derived", async () => {
        const response = await requestCommerce("/me/sale/cancel", {
            userId: "seller-4",
            body: { orderId: 42, reason: "cannot_ship", actorId: "spoofed" },
        });

        expect(response.status).toBe(201);
        expect(expectSingleRpc("request_order_cancellation").body).toEqual({
            p_order_id: 42,
            p_actor_kind: "seller",
            p_actor_id: "seller-4",
            p_reason: "cannot_ship",
        });
    });

    test("fails closed when an admin action lacks the admin role or actor", async () => {
        const body = {
            refundRequestId: 19,
            decision: "approved",
            reason: "reviewed",
            expectedVersion: 2,
        };
        for (const userRole of [null, "user", "support", "finance"]) {
            const response = await requestCommerce("/admin/refund/review", {
                userId: "actor-7",
                userRole,
                body,
            });
            expect(response.status).toBe(403);
        }

        const missingActor = await requestCommerce("/admin/refund/review", {
            userRole: "admin",
            body,
        });
        expect(missingActor.status).toBe(401);
    });

    test("rejects legacy roles on the former operator routes", async () => {
        for (const path of ["/admin/protected-payments", "/admin/claims", "/admin/c2c-policies"]) {
            for (const userRole of [null, "user", "support", "finance"]) {
                const response = await requestCommerce(path, { userRole });
                expect(response.status).toBe(403);
                expect(await response.json()).toEqual({ error: "CMS admin role is required" });
            }
        }
    });

    test("does not let a legacy support role impersonate a system release actor", async () => {
        const response = await requestCommerce("/admin/order/release", {
            userId: "support-7",
            userRole: "support",
            body: { orderId: 42, expectedSettlementVersion: 3, actorKind: "system" },
        });
        expect(response.status).toBe(403);
    });

    test("records an order release as an admin action", async () => {
        const response = await requestCommerce("/admin/order/release", {
            userId: "admin-12",
            userRole: "admin",
            body: { orderId: 42, expectedSettlementVersion: 3, reason: "release reviewed" },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("authorize_order_release").body).toEqual({
            p_order_id: 42,
            p_actor_kind: "admin",
            p_actor_id: "admin-12",
            p_reason: "release reviewed",
            p_expected_settlement_version: 3,
        });
    });

    test("accepts claim return proof only through the trusted system route", async () => {
        const response = await requestCommerce("/system/claim/return-delivery", {
            body: {
                claimId: 7,
                providerEventId: "delivery:return:evt-17",
                providerReference: "return-tracking-17",
                normalizedStatus: "recipient_handoff",
                occurredAt: "2026-07-13T08:00:00.000Z",
                providerEvidence: { carrier: "mondial-relay", eventCode: "COLLECTED" },
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("record_claim_return_delivery").body).toEqual({
            p_claim_id: 7,
            p_provider_event_id: "delivery:return:evt-17",
            p_provider_reference: "return-tracking-17",
            p_normalized_status: "recipient_handoff",
            p_occurred_at: "2026-07-13T08:00:00.000Z",
            p_provider_evidence: { carrier: "mondial-relay", eventCode: "COLLECTED" },
        });
    });

    test("uploads buyer evidence privately and strips storage coordinates from the response", async () => {
        setRestResponder(async request => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/rest/v1/rpc/get_claim_evidence_upload_context")) {
                return jsonResponse({
                    state: "ok",
                    public_id: "3cc94e25-4398-4145-b353-841d81786c79",
                });
            }
            if (url.pathname.includes("/storage/v1/object/commerce-claim-evidence/")) return new Response(null, { status: 200 });
            if (url.pathname.endsWith("/rest/v1/rpc/attach_marketplace_claim_evidence")) {
                return jsonResponse({
                    id: 33,
                    claimId: 7,
                    submittedByKind: "buyer",
                    storage_bucket: "commerce-claim-evidence",
                    storage_path: "must-not-leak",
                    mimeType: "application/pdf",
                    fileSize: 14,
                    originalFilename: "proof.pdf",
                    sha256: "a".repeat(64),
                    description: "Opening proof",
                    metadata: { upload: "edge_multipart_v1" },
                    createdAt: "2026-07-13T08:00:00.000Z",
                });
            }
            throw new Error(`unexpected request ${request.url}`);
        });
        const form = new FormData();
        form.set("file", new File(["%PDF-1.4 test"], "proof.pdf", { type: "application/pdf" }));
        form.set("description", "Opening proof");

        const response = await requestCommerce("/me/order/claim/evidence?claimId=7", {
            userId: "buyer-17",
            formData: form,
        });
        const body = await response.json();
        expect(response.status).toBe(201);
        expect(body).toMatchObject({ id: 33, claimId: 7, submittedByKind: "buyer", mimeType: "application/pdf" });
        expect(body).not.toHaveProperty("storageBucket");
        expect(body).not.toHaveProperty("storagePath");
    });

    test("does not upload claim evidence for another buyer", async () => {
        setRestResponder(request => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/rest/v1/rpc/get_claim_evidence_upload_context")) {
                return jsonResponse({ state: "not_found" });
            }
            throw new Error("storage must not be reached for an unauthorized buyer");
        });
        const form = new FormData();
        form.set("file", new File(["%PDF-1.4 test"], "proof.pdf", { type: "application/pdf" }));
        const response = await requestCommerce("/me/order/claim/evidence?claimId=7", {
            userId: "buyer-17",
            formData: form,
        });
        expect(response.status).toBe(404);
    });

    test("does not upload claim evidence for another seller", async () => {
        setRestResponder(request => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/rest/v1/rpc/get_claim_evidence_upload_context")) {
                return jsonResponse({ state: "not_found" });
            }
            throw new Error("storage must not be reached for an unauthorized seller");
        });
        const form = new FormData();
        form.set("file", new File(["%PDF-1.4 test"], "proof.pdf", { type: "application/pdf" }));
        const response = await requestCommerce("/me/sale/claim/evidence?claimId=7", {
            userId: "seller-4",
            formData: form,
        });
        expect(response.status).toBe(404);
    });
});
