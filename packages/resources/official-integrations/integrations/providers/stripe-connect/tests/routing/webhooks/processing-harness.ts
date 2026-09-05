import {
    currentUnixTime,
    functionsBaseUrl,
    type JsonRecord,
    responseBody,
    type RoutingHarness,
    stripeSignature,
} from "../harness";

export async function sendStripeEvent(
    harness: RoutingHarness,
    event: JsonRecord,
    options: { route?: "stripe" | "stripe-connect"; secret?: string } = {},
): Promise<Response> {
    const payload = JSON.stringify({
        api_version: "2026-02-25.clover",
        created: currentUnixTime(),
        livemode: false,
        ...event,
    });
    const route = options.route ?? "stripe";
    const secret = options.secret ?? "whsec_test_123";
    return await harness.edgeRequest(
        new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/${route}`, {
            method: "POST",
            headers: { "stripe-signature": await stripeSignature(payload, secret) },
            body: payload,
        }),
    );
}

export async function runStripeProcessing(harness: RoutingHarness, runKey: string): Promise<JsonRecord> {
    const response = await harness.submit("admin-1", "admin", "runProviderReconciliation", { runKey, limit: 25 });
    return await responseBody(response);
}

export async function createSucceededPayment(harness: RoutingHarness, clientReferenceId: string): Promise<JsonRecord> {
    const enrolled = await harness.submit("seller-1", "admin", "enrollConnectSeller", {
        accountToken: "accttok_test_identity_123",
        marketplaceTermsAccepted: true,
        marketplaceTermsVersion: "marketplace-seller-2026-07",
        marketplaceTermsHash: "c".repeat(64),
    });
    if (!enrolled.ok) {
        throw new Error(`seller enrollment failed: ${await enrolled.text()}`);
    }
    const createdResponse = await harness.submit("buyer-1", "admin", "createProtectedPayment", {
        sellerUserId: "seller-1",
        amountTotal: 1200,
        sellerTransferAmount: 1080,
        currency: "eur",
        clientReferenceId,
        financialTermsHash: "a".repeat(64),
        dualApprovalThresholdAmount: 1000,
    });
    const created = await responseBody(createdResponse);
    harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
    const refreshed = await harness.request("buyer-1", "admin", "getProtectedPayment", {
        paymentId: String(created.paymentId),
    });
    if (!refreshed.ok) {
        throw new Error(`payment refresh failed: ${await refreshed.text()}`);
    }
    return created;
}
