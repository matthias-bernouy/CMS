import { describe, expect, test } from "bun:test";
import { type CreateRoutingHarness, responseBody } from "../harness";
import { createSucceededPayment, runStripeProcessing, sendStripeEvent } from "./processing-harness";

export function registerStripeWebhookMoneyProcessingContracts(createHarness: CreateRoutingHarness): void {
    describe("stripe-connect webhook money processing contracts", () => {
        test("quarantines charge.refunded when provider truth contains an untracked refund", async () => {
            const harness = await createHarness();
            const created = await createSucceededPayment(harness, "charge-refunded-processing");
            harness.rest.addProviderRefund("ch_1", { id: "re_charge_refunded", amount: 300 });
            const ingested = await sendStripeEvent(harness, {
                id: "evt_charge_refunded_processing",
                type: "charge.refunded",
                data: { object: { id: "ch_1" } },
            });

            expect(ingested.status).toBe(202);
            const run = await runStripeProcessing(harness, "charge-refunded-processing");

            expect(run).toMatchObject({ status: "succeeded", repairedCount: 1, exceptionCount: 0 });
            expect(harness.rest.rows("payments")[0]).toMatchObject({
                id: created.paymentId,
                refunded_amount: 0,
                settlement_status: "manual_review",
                manual_review_reason: "untracked Stripe refund re_charge_refunded",
                last_stripe_event_id: "evt_charge_refunded_processing",
            });
            expect(harness.rest.rows("stripe_events")[0]).toMatchObject({ processing_status: "processed" });
        });

        test("applies a tracked transfer snapshot and updates its payment event cursor", async () => {
            const harness = await createHarness();
            const created = await createSucceededPayment(harness, "transfer-webhook-processing");
            const release = await harness.submit("buyer-1", "admin", "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "transfer-webhook-release",
                releaseKind: "initial",
                amount: 500,
                currency: "eur",
            });
            expect(release.status).toBe(200);
            const transfer = harness.rest.rows("transfers")[0];
            const stripeTransferId = String(transfer.stripe_transfer_id);
            harness.rest.patchProviderTransfer(stripeTransferId, { amount_reversed: 125, reversed: false });
            const providerSnapshot = {
                id: stripeTransferId,
                amount: 500,
                amount_reversed: 125,
                reversed: false,
            };
            const ingested = await sendStripeEvent(harness, {
                id: "evt_transfer_processing",
                type: "transfer.updated",
                data: { object: providerSnapshot },
            });

            expect(ingested.status).toBe(202);
            expect(await responseBody(ingested)).toEqual({ received: true, duplicate: false });
            const run = await runStripeProcessing(harness, "transfer-webhook-processing");

            expect(run).toMatchObject({ status: "succeeded", repairedCount: 1, exceptionCount: 0 });
            expect(harness.rest.rows("transfers")[0]).toMatchObject({
                stripe_transfer_id: stripeTransferId,
                status: "partially_reversed",
            });
            expect(harness.rest.rows("payments")[0]).toMatchObject({
                last_stripe_event_id: "evt_transfer_processing",
            });
            expect(harness.rest.rows("stripe_events")[0]).toMatchObject({ processing_status: "processed" });
        });
    });
}
