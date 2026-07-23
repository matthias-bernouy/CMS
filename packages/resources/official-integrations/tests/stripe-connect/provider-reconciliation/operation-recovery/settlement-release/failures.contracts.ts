import { describe, expect, test } from "bun:test";
import { matchingProviderTransfer, providerReconciliationRequests, transferCreateRequest } from "./fixtures";
import {
    type CreateSettlementReleaseHarness,
    createSettlementReleaseFixture,
    postgrestCalls,
    responseJson,
    transferIdempotencyKey,
} from "./harness";

export function registerSettlementReleaseFailureContracts(createHarness: CreateSettlementReleaseHarness): void {
    describe("stripe-connect settlement release failure contracts", () => {
        test("quarantines a Stripe Transfer creation failure with the exact provider error", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-create-failure");
            const idempotencyKey = await transferIdempotencyKey(fixture.paymentId, fixture.releaseAuthorizationId);
            fixture.rest.failNextTransferCreationOnce();
            fixture.resetRequests();

            const response = await fixture.release();

            expect(response.status).toBe(502);
            expect(await responseJson(response)).toEqual({ error: "provider request failed" });
            expect(fixture.rest.stripeRequests.map(({ method, pathname }) => [method, pathname])).toEqual([
                ...providerReconciliationRequests,
                ["POST", "/v1/transfers"],
            ]);
            expect(fixture.rest.stripeRequests.at(-1)).toEqual(transferCreateRequest(idempotencyKey));
            expect(postgrestCalls(fixture)).toEqual([
                ...releasePreparationCalls(),
                ["PATCH", "financial_operations"],
                ["PATCH", "transfers"],
                ["PATCH", "financial_operations"],
                ["POST", "rpc/mark_payment_manual_review"],
                ["POST", "provider_exceptions"],
            ]);
            expectManualReview(fixture, "simulated Stripe Transfer creation failure");
            const operation = fixture.rest
                .rows("financial_operations")
                .find((row) => row.operation_type === "transfer_create")!;
            expect(fixture.rest.rows("transfers")).toEqual([
                {
                    id: expect.any(Number),
                    payment_id: fixture.paymentId,
                    operation_id: operation.id,
                    release_authorization_id: fixture.releaseAuthorizationId,
                    release_kind: "initial",
                    source_charge_id: fixture.chargeId,
                    destination_account_id: fixture.accountId,
                    transfer_group: fixture.transferGroup,
                    amount: 1080,
                    currency: "eur",
                    status: "processing",
                    created_at: "2026-07-06T12:05:00.000Z",
                    updated_at: "2026-07-06T12:10:00.000Z",
                },
            ]);
        });

        test("moves an ambiguous provider metadata match to manual review without creating a Transfer", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-ambiguous-provider");
            const seed = fixture.rest.seedNonterminalSettlementRelease(
                fixture.paymentId,
                fixture.releaseAuthorizationId,
            );
            const providerTransfer = matchingProviderTransfer(fixture);
            fixture.rest.addProviderTransfer(fixture.transferGroup, providerTransfer);
            fixture.rest.addProviderTransfer(fixture.transferGroup, providerTransfer);
            fixture.rest.omitProviderTransfersOnNextList();
            fixture.resetRequests();

            const response = await fixture.release();

            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({ error: "Stripe Transfer search is ambiguous" });
            expect(fixture.rest.stripeRequests.map(({ method, pathname }) => [method, pathname])).toEqual([
                ...providerReconciliationRequests,
                ["GET", "/v1/transfers"],
            ]);
            expect(
                fixture.rest.stripeRequests.filter(
                    ({ method, pathname }) => method === "POST" && pathname === "/v1/transfers",
                ),
            ).toEqual([]);
            expect(postgrestCalls(fixture)).toEqual([
                ...releasePreparationCalls().slice(0, -1),
                ["PATCH", "financial_operations"],
                ["POST", "rpc/mark_payment_manual_review"],
                ["POST", "provider_exceptions"],
            ]);
            expectManualReview(fixture, "Stripe Transfer search is ambiguous");
            expect(fixture.rest.rows("financial_operations").find((row) => row.id === seed.operationId)).toMatchObject({
                status: "manual_review",
                stripe_object_id: null,
                attempt_count: 1,
            });
            expect(fixture.rest.rows("transfers").find((row) => row.id === seed.transferId)).toMatchObject({
                status: "processing",
                stripe_transfer_id: null,
            });
        });
    });
}

function releasePreparationCalls(): Array<[string, string]> {
    return [
        ["GET", "payments"],
        ["POST", "rpc/apply_payment_provider_projection"],
        ["POST", "rpc/read_payment_reconciliation_local_context"],
        ["POST", "rpc/read_payment_reconciliation_ledger"],
        ["PATCH", "payments"],
        ["POST", "rpc/read_settlement_release_context"],
        ["POST", "rpc/reserve_financial_operation"],
        ["POST", "transfers"],
    ];
}

function expectManualReview(
    fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>,
    message: string,
): void {
    expect(
        fixture.rest.rows("financial_operations").find((row) => row.operation_type === "transfer_create"),
    ).toMatchObject({
        status: "manual_review",
        stripe_object_id: null,
        attempt_count: 1,
        last_error: message,
    });
    expect(fixture.rest.rows("payments")[0]).toMatchObject({
        settlement_status: "manual_review",
        manual_review_reason: message,
    });
    expect(fixture.rest.rows("provider_exceptions")).toEqual([
        expect.objectContaining({
            payment_id: fixture.paymentId,
            exception_type: "transfer_create_ambiguous",
            severity: "critical",
            message,
        }),
    ]);
}
