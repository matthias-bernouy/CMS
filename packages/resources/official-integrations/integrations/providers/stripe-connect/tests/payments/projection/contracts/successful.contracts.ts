import { expect, test } from "bun:test";
import {
    buyerUserId,
    createPaymentProjectionFixture,
    postgrestCalls,
    successfulJson,
    type CreatePaymentProjectionHarness,
    type JsonRecord,
} from "../harness";
import { successfulPayment } from "./expected-payment";

const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function registerSuccessfulProjectionContracts(createHarness: CreatePaymentProjectionHarness): void {
    test("preserves the exact successful provider projection and privacy boundary", async () => {
        const fixture = await createPaymentProjectionFixture(createHarness, "projection-success");
        fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
        fixture.resetRequests();

        const body = await successfulJson(await fixture.read());

        expect(body.paidAt).toEqual(expect.stringMatching(isoTimestamp));
        expect(body.lastProviderSyncAt).toEqual(expect.stringMatching(isoTimestamp));
        expect(body).toEqual(await successfulPayment(body, fixture.clientReferenceId));
        expect(JSON.stringify(body)).not.toContain("providerSnapshot");
        expect(JSON.stringify(body)).not.toContain("sellerStripeAccountId");
        expect(JSON.stringify(body)).not.toContain("clientSecret");
        expect(postgrestCalls(fixture)).toEqual([
            ["GET", "payments"],
            ["POST", "rpc/apply_payment_provider_projection"],
        ]);
        expect(fixture.rest.stripeRequests.map((request) => [request.method, request.pathname])).toEqual([
            ["GET", `/v1/payment_intents/${fixture.paymentIntentId}`],
        ]);
    });

    test("preserves the exact provider projection returned by client reference", async () => {
        const fixture = await createPaymentProjectionFixture(createHarness, "projection-reference");
        fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
        fixture.resetRequests();

        const body = await successfulJson(
            await fixture.request(buyerUserId, "getProtectedPaymentByClientReference", {
                clientReferenceId: fixture.clientReferenceId,
            }),
        );
        const payment = body.payment as JsonRecord;

        expect(body).toEqual({
            exists: true,
            payment: await successfulPayment(payment, fixture.clientReferenceId),
        });
        expect(postgrestCalls(fixture)).toEqual([
            ["GET", "payments"],
            ["POST", "rpc/apply_payment_provider_projection"],
        ]);
        expect(fixture.rest.stripeRequests.map((request) => [request.method, request.pathname])).toEqual([
            ["GET", `/v1/payment_intents/${fixture.paymentIntentId}`],
        ]);
    });
}
