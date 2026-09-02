import { describe, expect, test } from "bun:test";
import {
    clearRequests,
    type CreateProviderBoundaryHarness,
    enrollSeller,
    protectedPaymentBody,
    responseBody,
    type ProviderBoundaryHarness,
} from "../harness";

export function registerDisputeApplicationReadContextContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect dispute application read-context contracts", () => {
        test("preserves the blocked payment projection and provider boundary", async () => {
            const { harness, paymentId } = await preparedDispute(createHarness);

            const response = await harness.submit("system-dispute", "admin", "requestSettlementRelease", {
                paymentId,
                releaseAuthorizationId: "dispute-application-release",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            });

            expect(response.status).toBe(409);
            expect(await responseBody(response)).toEqual({
                error: "payment is blocked by an open, lost, or unresolved Stripe dispute",
            });
            expect(harness.rest.rows("payments")[0]).toMatchObject({
                dispute_status: "open",
                settlement_status: "blocked",
            });
            expect(harness.rest.rows("stripe_disputes")).toEqual([
                expect.objectContaining({
                    payment_id: paymentId,
                    stripe_dispute_id: "dp_dispute_application",
                    stripe_charge_id: "ch_1",
                    status: "needs_response",
                    evidence_status: "not_started",
                    funds_withdrawn: false,
                }),
            ]);
            expect(disputeApplicationReads(harness)).toEqual([
                { method: "POST", table: "rpc/read_stripe_dispute_application_context" },
            ]);
            expect(harness.rest.stripeRequests.map(({ method, pathname }) => ({ method, pathname }))).toEqual([
                { method: "GET", pathname: "/v1/payment_intents/pi_1" },
                { method: "GET", pathname: "/v1/disputes" },
                { method: "GET", pathname: "/v1/refunds" },
                { method: "GET", pathname: "/v1/transfers" },
            ]);
        });
    });
}

async function preparedDispute(
    createHarness: CreateProviderBoundaryHarness,
): Promise<{ harness: ProviderBoundaryHarness; paymentId: number }> {
    const harness = await createHarness();
    expect((await enrollSeller(harness)).status).toBe(200);
    const creation = await responseBody(
        await harness.submit(
            "buyer-dispute",
            "admin",
            "createProtectedPayment",
            protectedPaymentBody({ clientReferenceId: "dispute-application-payment" }),
        ),
    );
    const paymentId = Number(creation.paymentId);
    harness.rest.setPaymentIntentSucceeded(String(creation.stripePaymentIntentId));
    const projection = await harness.request("buyer-dispute", undefined, "getProtectedPayment", {
        paymentId: String(paymentId),
    });
    expect(projection.status).toBe(200);
    harness.rest.addProviderDispute("ch_1", { id: "dp_dispute_application" });
    clearRequests(harness);
    return { harness, paymentId };
}

function disputeApplicationReads(harness: ProviderBoundaryHarness): Array<{ method: string; table: string }> {
    return harness.rest.postgrestRequests
        .filter(
            ({ method, table, searchParams }) =>
                (table === "stripe_disputes" && method === "GET") ||
                table === "rpc/read_stripe_dispute_application_context" ||
                (table === "payments" && searchParams.some(([key]) => key === "stripe_charge_id")),
        )
        .map(({ method, table }) => ({ method, table }));
}
