import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import {
    consentDocument,
    consentReceipt,
    consentResponder,
    consentUrl,
    correlationId,
    prepare,
    versionId,
} from "./buyer-legal-fixtures";
installCommerceTestEnvironment();
describe("Commerce buyer Consent routes", () => {
    test("loads owner-scoped requirements through authenticated Consent HTTP without Delivery coordinates", async () => {
        consentResponder();
        const response = await requestCommerce("/me/order/legal-requirements?orderId=42&paymentProvider=stripe", {
            userId: "buyer-17",
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            enabled: true,
            documents: [
                {
                    key: "buyer_checkout.terms",
                    label: consentDocument.label,
                    consentText: consentDocument.consentText,
                    pageUrl: "/terms",
                    versionId,
                    versionDate: consentDocument.versionDate,
                },
            ],
        });
        expect(expectRpc("get_buyer_consent_context").body).toEqual({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-17",
            p_payment_provider: "stripe",
        });
        const calls = capturedFetches().filter((call) => call.url.startsWith(consentUrl));
        expect(calls).toHaveLength(2);
        expect(calls[0]!.body).toEqual({
            contextKey: "buyer_checkout",
            operationKey: "commerce:payment:stripe:order-public-42",
            cmsUserId: "buyer-17",
        });
        for (const call of calls) {
            expect(call.headers.get("authorization")).toBe("Bearer consent-api-key");
            expect(call.headers.get("apikey")).toBeNull();
            expect(call.redirect).toBe("error");
        }
        expect(capturedFetches()).toHaveLength(3);
    });
    test("requires a valid provider before resolving Consent", async () => {
        const response = await requestCommerce("/me/order/legal-requirements?orderId=42", { userId: "buyer-17" });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "paymentProvider is invalid" });
        expect(capturedFetches()).toHaveLength(0);
    });
    test("records accepted versions with server-derived order identity and forwards only the service receipt", async () => {
        consentResponder();
        const response = await prepare([versionId], {
            buyerId: "attacker",
            consentReceipts: [{ forged: true }],
            verifiedLegalDocuments: [{ publishedSnapshotUrl: "https://attacker.test" }],
        });
        expect(response.status).toBe(200);
        const acceptance = capturedFetches().find((call) => call.url === `${consentUrl}/operations/accept`)!;
        expect(acceptance.body).toEqual({
            contextKey: "buyer_checkout",
            operationKey: "commerce:payment:stripe:order-public-42",
            cmsUserId: "buyer-17",
            acceptedVersionIds: [versionId],
            metadata: consentReceipt().metadata,
        });
        const body = expectRpc("prepare_protected_payment").body;
        expect(body).toEqual({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-17",
            p_payment_provider: "stripe",
            p_consent_receipts: [consentReceipt()],
            p_correlation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        });
        expect(JSON.stringify(capturedFetches())).not.toContain("attacker.test");
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
        consentResponder();
        const response = await requestCommerce("/me/order/payment/prepare", {
            userId: "buyer-17",
            correlationId,
            body: { orderId: 42, acceptedLegalDocumentVersionIds: [versionId] },
        });
        expect(response.status).toBe(200);
        expect(expectRpc("prepare_protected_payment").body.p_correlation_id).toBe(correlationId);
    });
    test.each([["stale"], ["3d341928-b30d-4af5-b918-eab9df624706"]])(
        "rejects a non-hash revision before backend work: %s",
        async (id) => {
            const response = await prepare([id]);
            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({ error: "LEGAL_DOCUMENT_VERSION_CHANGED" });
            expect(capturedFetches()).toHaveLength(0);
        },
    );
});
