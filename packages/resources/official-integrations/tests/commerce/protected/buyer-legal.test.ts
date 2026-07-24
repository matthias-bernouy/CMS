import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../harness";
import {
    correlationId,
    legalPage,
    rpcName,
    snapshotResponse,
    snapshotUrl,
    verificationContext,
    versionId,
} from "./buyer-legal-fixtures";

installCommerceTestEnvironment();

describe("commerce buyer legal acceptance routes", () => {
    test("loads live owner-scoped requirements without exposing verification coordinates", async () => {
        setSuccessfulResponder({
            get_fresh_buyer_legal_requirements: {
                enabled: true,
                documents: [
                    {
                        key: "terms",
                        label: "Terms",
                        consentText: "I accept the terms",
                        pageUrl: "/terms",
                        versionId,
                    },
                ],
            },
        });
        const response = await requestCommerce("/me/order/legal-requirements?orderId=42", {
            userId: "buyer-17",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            enabled: true,
            documents: [
                {
                    key: "terms",
                    label: "Terms",
                    consentText: "I accept the terms",
                    pageUrl: "/terms",
                    versionId,
                },
            ],
        });
        expect(expectRpc("get_buyer_legal_verification_context").body).toEqual({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-17",
            p_payment_provider: null,
        });
        expect(expectRpc("get_fresh_buyer_legal_requirements").body.p_verified_documents).toEqual([
            expect.objectContaining({
                key: "terms",
                expectedVersionId: versionId,
                page: legalPage,
            }),
        ]);
        expect(capturedFetches().find((call) => call.url === snapshotUrl)?.redirect).toBe("error");
    });

    test("forwards only accepted revisions plus server-verified snapshots to prepare", async () => {
        setSuccessfulResponder();
        const response = await requestCommerce("/me/order/payment/prepare", {
            userId: "buyer-17",
            body: {
                orderId: 42,
                acceptedLegalDocumentVersionIds: [versionId],
                paymentProvider: "stripe",
                verifiedLegalDocuments: [{ publishedSnapshotUrl: "https://attacker.test" }],
            },
        });

        expect(response.status).toBe(200);
        const body = expectRpc("prepare_protected_payment").body;
        expect(body).toMatchObject({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-17",
            p_accepted_legal_document_version_ids: [versionId],
            p_payment_provider: "stripe",
            p_verified_legal_documents: [
                {
                    key: "terms",
                    expectedVersionId: versionId,
                    page: legalPage,
                },
            ],
        });
        expect(JSON.stringify(body)).not.toContain("attacker.test");
        expect(body.p_correlation_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    test("keeps audit owner-scoped and administrator-only", async () => {
        const owner = await requestCommerce("/me/order/legal-acceptances?orderId=42", {
            userId: "buyer-17",
        });
        expect(owner.status).toBe(200);
        expect(expectSingleRpc("get_buyer_legal_acceptance_audit").body).toEqual({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-17",
        });

        const forbidden = await requestCommerce("/admin/order/legal-acceptances?orderId=42", {
            userRole: null,
        });
        expect(forbidden.status).toBe(403);
        const admin = await requestCommerce("/admin/order/legal-acceptances?orderId=42");
        expect(admin.status).toBe(200);
        const auditCalls = capturedFetches().filter((call) =>
            call.url.endsWith("/rpc/get_buyer_legal_acceptance_audit"),
        );
        expect(auditCalls).toHaveLength(2);
        expect(auditCalls.at(-1)?.body.p_buyer_cms_user_id).toBeNull();
    });

    test("uses a supplied request correlation id", async () => {
        setSuccessfulResponder();
        const response = await requestCommerce("/me/order/payment/prepare", {
            userId: "buyer-17",
            correlationId,
            body: { orderId: 42, acceptedLegalDocumentVersionIds: [versionId] },
        });

        expect(response.status).toBe(200);
        expect(expectRpc("prepare_protected_payment").body.p_correlation_id).toBe(correlationId);
    });

    test("rejects an invalid revision id before any backend or Delivery request", async () => {
        const response = await requestCommerce("/me/order/payment/prepare", {
            userId: "buyer-17",
            body: { orderId: 42, acceptedLegalDocumentVersionIds: ["stale"] },
        });

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "LEGAL_DOCUMENT_VERSION_CHANGED" });
        expect(capturedFetches()).toHaveLength(0);
    });
});

function setSuccessfulResponder(overrides: Record<string, unknown> = {}): void {
    setRestResponder((request) => {
        if (request.url === snapshotUrl) {
            return snapshotResponse();
        }
        const name = rpcName(request);
        if (name === "get_buyer_legal_verification_context") {
            return jsonResponse(verificationContext());
        }
        return jsonResponse(overrides[name] ?? { id: 1 });
    });
}
