import { describe, expect, test } from "bun:test";
import { expectedTransfer, providerReconciliationRequests } from "./fixtures";
import {
    type CreateSettlementReleaseHarness,
    createSettlementReleaseFixture,
    postgrestCalls,
    responseJson,
    successfulJson,
} from "./harness";

export function registerSettlementReleaseReadOrderContracts(createHarness: CreateSettlementReleaseHarness): void {
    describe("stripe-connect settlement release read order contracts", () => {
        test("observes seller risk committed before the seller account read", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-account-freshness");
            const pause = fixture.rest.pauseNextPostgrestRead("accounts");
            fixture.resetRequests();

            const pending = fixture.release();
            await pause.entered;
            fixture.rest.setAccountState(fixture.sellerUserId, { risk_status: "restricted" });
            pause.resume();
            const response = await pending;

            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({
                error: "seller financial risk blocks settlement release",
            });
            expect(postgrestCalls(fixture)).toEqual([...reconciledPaymentReads, ["GET", "accounts"]]);
            expect(stripeCalls(fixture)).toEqual(providerReconciliationRequests);
            expectNoReleaseMutation(fixture);
        });

        test("observes an authorized succeeded Transfer committed after the account read", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-authorization-freshness");
            const pause = fixture.rest.pauseNextPostgrestRead("transfers");
            fixture.resetRequests();

            const pending = fixture.release();
            await pause.entered;
            const transfer = fixture.rest.seedSettlementLedgerRow("transfers", replayTransfer(fixture));
            pause.resume();
            const response = await successfulJson(await pending);

            expect(response).toEqual(expectedTransfer(fixture, transfer));
            expect(postgrestCalls(fixture)).toEqual([
                ...reconciledPaymentReads,
                ["GET", "accounts"],
                ["GET", "transfers"],
            ]);
            expect(stripeCalls(fixture)).toEqual(providerReconciliationRequests);
            expect(fixture.rest.stripeRequests.filter(({ method }) => method === "POST")).toEqual([]);
        });

        test("observes refund entitlement committed after the authorization read", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-entitlement-freshness");
            const pause = fixture.rest.pauseNextPostgrestRead("refunds");
            fixture.resetRequests();

            const pending = fixture.release();
            await pause.entered;
            fixture.rest.seedSettlementLedgerRow("refunds", succeededRefund(fixture.paymentId, 100));
            pause.resume();
            const response = await pending;

            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({
                error: "release exceeds the authorized seller transfer amount",
            });
            expect(postgrestCalls(fixture)).toEqual([
                ...reconciledPaymentReads,
                ["GET", "accounts"],
                ["GET", "transfers"],
                ["GET", "refunds"],
            ]);
            expect(stripeCalls(fixture)).toEqual(providerReconciliationRequests);
            expectNoReleaseMutation(fixture);
        });
    });
}

const reconciledPaymentReads: Array<[string, string]> = [
    ["GET", "payments"],
    ["POST", "rpc/apply_payment_provider_projection"],
    ["POST", "rpc/read_payment_reconciliation_local_context"],
    ["POST", "rpc/read_payment_reconciliation_ledger"],
    ["PATCH", "payments"],
];

function stripeCalls(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>): Array<[string, string]> {
    return fixture.rest.stripeRequests.map(({ method, pathname }) => [method, pathname]);
}

function expectNoReleaseMutation(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>): void {
    expect(fixture.rest.rows("transfers")).toEqual([]);
    expect(fixture.rest.rows("financial_operations").filter((row) => row.operation_type === "transfer_create")).toEqual(
        [],
    );
}

function replayTransfer(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>) {
    return {
        payment_id: fixture.paymentId,
        operation_id: 999,
        release_authorization_id: fixture.releaseAuthorizationId,
        release_kind: "initial",
        stripe_transfer_id: `tr_seed_${fixture.paymentId}`,
        source_charge_id: fixture.chargeId,
        destination_account_id: fixture.accountId,
        transfer_group: fixture.transferGroup,
        amount: 1080,
        currency: "eur",
        status: "succeeded",
        provider_snapshot: { id: `tr_seed_${fixture.paymentId}`, amount: 1080 },
        updated_at: "2026-07-06T12:10:00.000Z",
    };
}

function succeededRefund(paymentId: number, reduction: number) {
    return {
        payment_id: paymentId,
        refund_request_id: `seed-refund-${paymentId}-${reduction}`,
        amount: reduction,
        seller_entitlement_reduction_amount: reduction,
        currency: "eur",
        status: "succeeded",
    };
}
