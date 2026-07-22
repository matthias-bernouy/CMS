import { expect, test } from "bun:test";
import { financialTermsHash, functionsBaseUrl } from "../../../../runtime/constants";
import { okJson, stripeSignature } from "../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../runtime/source-requests";
import type { CreateDisputeRecoveryScenarioHarness } from "./harness";

export function registerDisputeFundsOrderingScenario(createHarness: CreateDisputeRecoveryScenarioHarness): void {
    test("orders dispute funds events monotonically and ignores stale or losing tie events", async () => {
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
                clientReferenceId: "order-dispute-funds-ordering",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.addProviderDispute("ch_1", { id: "dp_funds_ordering", status: "won" });

        const sendFundsEvent = async (eventId: string, eventType: string, createdAt: number, runKey: string) => {
            const payload = JSON.stringify({
                id: eventId,
                type: eventType,
                api_version: "2026-02-25.clover",
                created: createdAt,
                livemode: false,
                data: { object: { id: "dp_funds_ordering" } },
            });
            const signature = await stripeSignature(payload, "whsec_test_123");
            await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                    method: "POST",
                    headers: { "stripe-signature": signature },
                    body: payload,
                }),
            );
            await okJson(await sourceJson(harness, "runProviderReconciliation", { runKey, limit: 25 }));
        };

        const base = Math.floor(Date.now() / 1000) - 100;
        await sendFundsEvent(
            "evt_funds_withdrawn_new",
            "charge.dispute.funds_withdrawn",
            base + 20,
            "funds-withdrawn-new",
        );
        await sendFundsEvent(
            "evt_funds_reinstated_stale",
            "charge.dispute.funds_reinstated",
            base + 10,
            "funds-reinstated-stale",
        );
        expect(harness.rest.rows("stripe_disputes")[0]).toMatchObject({
            funds_withdrawn: true,
            last_funds_event_id: "evt_funds_withdrawn_new",
        });
        const blocked = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-blocked-by-current-funds-truth",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        expect(blocked.status).toBe(409);

        await sendFundsEvent(
            "evt_funds_a_withdrawn",
            "charge.dispute.funds_withdrawn",
            base + 30,
            "funds-tie-withdrawn-a",
        );
        await sendFundsEvent(
            "evt_funds_z_reinstated",
            "charge.dispute.funds_reinstated",
            base + 30,
            "funds-tie-reinstated-z",
        );
        await sendFundsEvent(
            "evt_funds_b_withdrawn",
            "charge.dispute.funds_withdrawn",
            base + 30,
            "funds-tie-withdrawn-b",
        );
        expect(harness.rest.rows("stripe_disputes")[0]).toMatchObject({
            funds_withdrawn: true,
            last_funds_event_id: "same-second-conflict",
        });

        await sendFundsEvent(
            "evt_funds_first_reinstated",
            "charge.dispute.funds_reinstated",
            base + 40,
            "funds-tie-reinstated-first",
        );
        await sendFundsEvent(
            "evt_funds_second_withdrawn",
            "charge.dispute.funds_withdrawn",
            base + 40,
            "funds-tie-withdrawn-second",
        );
        expect(harness.rest.rows("stripe_disputes")[0]).toMatchObject({
            funds_withdrawn: true,
            last_funds_event_id: "same-second-conflict",
        });
        const stillBlocked = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-blocked-by-same-second-conflict",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        expect(stillBlocked.status).toBe(409);
    });
}
