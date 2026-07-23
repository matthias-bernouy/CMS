import { describe, expect, test } from "bun:test";
import { createPaymentLedgerFixture, type CreateProviderReconciliationHarness } from "../harness";

export function registerPaymentReconciliationProviderFailureContracts(
    createHarness: CreateProviderReconciliationHarness,
): void {
    describe("stripe-connect payment reconciliation provider failure contracts", () => {
        test.each([
            {
                name: "dispute",
                fail: (fixture: Awaited<ReturnType<typeof createPaymentLedgerFixture>>) =>
                    fixture.rest.failNextProviderDisputeList(),
                error: "simulated Stripe dispute list outage",
                stripePaths: ["/v1/payment_intents/", "/v1/disputes"],
            },
            {
                name: "refund",
                fail: (fixture: Awaited<ReturnType<typeof createPaymentLedgerFixture>>) =>
                    fixture.rest.failNextProviderRefundList(),
                error: "simulated Stripe refund list outage",
                stripePaths: ["/v1/payment_intents/", "/v1/disputes", "/v1/refunds"],
            },
        ])("stops at the $name provider pass", async ({ name, fail, stripePaths }) => {
            const fixture = await createPaymentLedgerFixture(
                createHarness,
                `payment-reconciliation-${name}-list-failure`,
            );
            fail(fixture);

            const failed = await fixture.submit("system-provider-failure", "reconcileProviderPayment", {
                paymentId: fixture.paymentId,
            });

            expect(failed.status).toBe(502);
            expect(await failed.json()).toEqual({ error: "provider request failed" });
            expect(
                fixture.rest.stripeRequests.map(({ pathname }) =>
                    pathname.startsWith("/v1/payment_intents/") ? "/v1/payment_intents/" : pathname,
                ),
            ).toEqual(stripePaths);
            expect(fixture.rest.postgrestRequests.map(({ method, table }) => [method, table])).toEqual([
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
            ]);
        });
    });
}
