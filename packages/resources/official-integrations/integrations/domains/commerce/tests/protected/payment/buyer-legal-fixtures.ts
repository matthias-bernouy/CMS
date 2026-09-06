import { jsonResponse, requestCommerce, setRestResponder, supabaseUrl, type JsonRecord } from "../../harness";

export const versionId = "a".repeat(64);
export const nextVersionId = "b".repeat(64);
export const correlationId = "23484f33-28d7-4b47-a0bf-48870a4d80ba";
export const consentUrl = `${supabaseUrl}/functions/v1/cms-consent`;
export const consentDocument = {
    documentKey: "terms",
    versionId,
    versionDate: "2026-09-06T08:00:00Z",
    label: "Terms",
    consentText: "I accept the terms",
    page: { path: "/terms" },
};
export function consentContext(overrides: JsonRecord = {}): JsonRecord {
    return {
        requiresConsent: true,
        contexts: ["buyer_checkout"],
        orderId: 42,
        orderPublicId: "order-public-42",
        checkoutGroupId: "checkout-42",
        buyerCmsUserId: "buyer-17",
        paymentProvider: "stripe",
        operationKey: "commerce:payment:stripe:order-public-42",
        ...overrides,
    };
}
export function consentReceipt(overrides: JsonRecord = {}): JsonRecord {
    const context = consentContext();
    return {
        schemaVersion: 1,
        required: true,
        contextKey: "buyer_checkout",
        operationKey: context.operationKey,
        cmsUserId: "buyer-17",
        acceptanceId: "3d341928-b30d-4af5-b918-eab9df624706",
        acceptedAt: "2026-09-06T08:00:00Z",
        documents: [{ ...consentDocument, contentHash: "c".repeat(64) }],
        metadata: {
            orderId: 42,
            orderPublicId: context.orderPublicId,
            checkoutGroupId: context.checkoutGroupId,
            paymentProvider: "stripe",
        },
        ...overrides,
    };
}
export function consentResponder(overrides: (request: Request) => Response | undefined = () => undefined): void {
    setRestResponder((request) => {
        const overridden = overrides(request);
        if (overridden) {
            return overridden;
        }
        if (request.url.endsWith("/rpc/get_buyer_consent_context")) {
            return jsonResponse(consentContext());
        }
        if (request.url === `${consentUrl}/operations/receipt`) {
            return jsonResponse({ receipt: null });
        }
        if (request.url.startsWith(`${consentUrl}/requirements?`)) {
            return jsonResponse({ enabled: true, documents: [consentDocument] });
        }
        if (request.url === `${consentUrl}/operations/accept`) {
            return jsonResponse(consentReceipt());
        }
        if (request.url.endsWith("/rpc/prepare_protected_payment")) {
            return jsonResponse({ paymentAttemptId: 8 });
        }
        throw new Error(`Unexpected request: ${request.url}`);
    });
}
export function prepare(acceptedIds: string[] = [versionId], extra: JsonRecord = {}): Promise<Response> {
    return requestCommerce("/me/order/payment/prepare", {
        userId: "buyer-17",
        body: {
            orderId: 42,
            paymentProvider: "stripe",
            acceptedLegalDocumentVersionIds: acceptedIds,
            ...extra,
        },
    });
}
