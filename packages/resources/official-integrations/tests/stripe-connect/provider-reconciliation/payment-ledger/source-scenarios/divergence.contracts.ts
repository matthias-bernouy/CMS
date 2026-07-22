import { expect, test } from "bun:test";
import { financialTermsHash, functionsBaseUrl } from "../../../runtime/constants";
import { okJson, stripeSignature } from "../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../runtime/source-requests";
import type { CreatePaymentRecoveryScenarioHarness, PaymentRecoveryScenarioRest } from "./harness";

export function registerProviderTruthDivergenceScenarios(createHarness: CreatePaymentRecoveryScenarioHarness): void {
    test("fails closed when Stripe succeeded payment truth diverges from immutable Commerce terms", async () => {
        const cases: Array<[string, (rest: PaymentRecoveryScenarioRest, paymentIntentId: string) => void]> = [
            ["lower PaymentIntent amount", (rest, id) => rest.patchPaymentIntent(id, { amount: 1199 })],
            ["wrong PaymentIntent currency", (rest, id) => rest.patchPaymentIntent(id, { currency: "usd" })],
            [
                "wrong PaymentIntent transfer group",
                (rest, id) => rest.patchPaymentIntent(id, { transfer_group: "order:other" }),
            ],
            [
                "wrong immutable terms hash",
                (rest, id) => rest.patchPaymentIntentMetadata(id, { financial_terms_hash: "b".repeat(64) }),
            ],
            ["under-captured Charge", (rest, id) => rest.patchLatestCharge(id, { amount_captured: 1199 })],
            ["unpaid Charge", (rest, id) => rest.patchLatestCharge(id, { paid: false })],
            [
                "wrong Charge transfer group",
                (rest, id) => rest.patchLatestCharge(id, { transfer_group: "order:other" }),
            ],
        ];

        for (const [name, mutate] of cases) {
            const harness = await createHarness();
            await okJson(
                await sourceJson(
                    harness,
                    "createConnectOnboardingSessionForUser",
                    {
                        email: `seller-${name.replaceAll(" ", "-")}@example.com`,
                    },
                    { userId: "seller-1" },
                ),
            );
            const created = await okJson(
                await sourceJson(harness, "createProtectedPayment", {
                    sellerUserId: "seller-1",
                    amountTotal: 1200,
                    sellerTransferAmount: 1080,
                    currency: "eur",
                    clientReferenceId: `provider-truth-${name}`,
                    financialTermsHash,
                    dualApprovalThresholdAmount: 1000,
                }),
            );
            const paymentIntentId = String(created.stripePaymentIntentId);
            harness.rest.setPaymentIntentSucceeded(paymentIntentId);
            mutate(harness.rest, paymentIntentId);

            const synced = await okJson(
                await sourceRequest(harness, "getProtectedPayment", {
                    paymentId: String(created.paymentId),
                }),
            );

            expect(synced, name).toMatchObject({ paymentStatus: "failed", settlementStatus: "manual_review" });
            expect(harness.rest.rows("provider_exceptions"), name).toContainEqual(
                expect.objectContaining({
                    payment_id: created.paymentId,
                    exception_type: "provider_payment_truth_mismatch",
                    severity: "critical",
                    status: "open",
                }),
            );
            expect(harness.rest.rows("payment_events"), name).toContainEqual(
                expect.objectContaining({
                    payment_id: created.paymentId,
                    event_type: "provider_payment_truth_mismatch",
                    actor_kind: "reconciliation",
                }),
            );
        }
    });

    test("never lets charge.succeeded override a provider-truth quarantine", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "charge-webhook-provider-truth",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.patchLatestCharge(paymentIntentId, { amount_captured: 1199 });
        const payload = JSON.stringify({
            id: "evt_charge_truth_mismatch",
            type: "charge.succeeded",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: "ch_1", payment_intent: paymentIntentId } },
        });
        const signature = await stripeSignature(payload, "whsec_test_123");
        const accepted = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        expect(accepted.status).toBe(202);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "charge-provider-truth-mismatch",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payments")[0]).toMatchObject({
            payment_status: "failed",
            settlement_status: "manual_review",
            stripe_charge_id: "ch_1",
        });
        expect(harness.rest.rows("payment_events")).toContainEqual(
            expect.objectContaining({
                event_type: "provider_payment_truth_mismatch",
                actor_kind: "webhook",
                actor_id: "evt_charge_truth_mismatch",
            }),
        );
    });
}
