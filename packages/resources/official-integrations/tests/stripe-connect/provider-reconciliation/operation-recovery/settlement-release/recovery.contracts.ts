import { describe, expect, test } from "bun:test";
import {
    expectedNonterminalRecoveryResponse,
    expectedTransfer,
    nonterminalRecoveryDatabaseCalls,
    providerReconciliationRequests,
    transferCreateRequest,
} from "./fixtures";
import {
    type CreateSettlementReleaseHarness,
    createSettlementReleaseFixture,
    postgrestCalls,
    responseJson,
    successfulJson,
    transferIdempotencyKey,
} from "./harness";

export function registerSettlementReleaseRecoveryContracts(createHarness: CreateSettlementReleaseHarness): void {
    describe("stripe-connect settlement release recovery contracts", () => {
        test("recovers a lost Transfer response by its immutable provider metadata", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-lost-response");
            const idempotencyKey = await transferIdempotencyKey(fixture.paymentId, fixture.releaseAuthorizationId);
            fixture.rest.loseNextTransferResponseOnce();
            fixture.resetRequests();

            const lost = await fixture.release();
            const operation = releaseOperation(fixture);
            const transfer = releaseTransfer(fixture);

            expect(lost.status).toBe(500);
            expect(await responseJson(lost)).toEqual({ error: "internal error" });
            expect(fixture.rest.stripeRequests.at(-1)).toEqual(transferCreateRequest(idempotencyKey));
            expect(fixture.rest.lastTransferParameters).toEqual({
                amount: "1080",
                currency: "eur",
                destination: fixture.accountId,
                source_transaction: fixture.chargeId,
                transfer_group: fixture.transferGroup,
                "metadata[cms_payment_id]": String(fixture.paymentId),
                "metadata[cms_release_authorization_id]": fixture.releaseAuthorizationId,
                "metadata[cms_release_kind]": "initial",
                "metadata[financial_terms_hash]": "a".repeat(64),
            });
            expect(operation).toMatchObject({
                status: "manual_review",
                stripe_object_id: null,
                attempt_count: 1,
                last_error: "simulated network loss after Stripe created the Transfer",
            });
            expect(transfer).toEqual({
                id: transfer.id,
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
            });
            expect(fixture.rest.rows("payments")[0]).toMatchObject({
                settlement_status: "manual_review",
                manual_review_reason: "simulated network loss after Stripe created the Transfer",
            });
            expect(fixture.rest.rows("provider_exceptions")).toContainEqual(
                expect.objectContaining({
                    payment_id: fixture.paymentId,
                    operation_id: operation.id,
                    exception_type: "transfer_create_ambiguous",
                    severity: "critical",
                    message: "simulated network loss after Stripe created the Transfer",
                }),
            );

            fixture.rest.patchPaymentLedger(fixture.paymentId, {
                settlement_status: "held",
                manual_review_reason: null,
            });
            fixture.rest.omitProviderTransfersOnNextList();
            fixture.resetRequests();

            const recovered = await successfulJson(await fixture.release());
            const recoveredTransfer = releaseTransfer(fixture);

            expect(recovered).toEqual(expectedTransfer(fixture, recoveredTransfer));
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
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
                ["POST", "rpc/read_payment_reconciliation_local_context"],
                ["POST", "rpc/read_payment_reconciliation_ledger"],
                ["PATCH", "payments"],
                ["GET", "accounts"],
                ["GET", "transfers"],
                ["GET", "refunds"],
                ["POST", "rpc/reserve_financial_operation"],
                ["PATCH", "transfers"],
                ["PATCH", "financial_operations"],
                ["GET", "transfers"],
                ["GET", "transfer_reversals"],
                ["GET", "refunds"],
                ["PATCH", "payments"],
            ]);
            expect(releaseOperation(fixture)).toMatchObject({
                id: operation.id,
                status: "succeeded",
                stripe_object_id: "tr_1",
                attempt_count: 1,
                last_error: "simulated network loss after Stripe created the Transfer",
            });
        });

        test("retries a nonterminal transfer_create through financial operation recovery", async () => {
            const fixture = await createSettlementReleaseFixture(createHarness, "settlement-nonterminal-recovery");
            const seed = fixture.rest.seedNonterminalSettlementRelease(
                fixture.paymentId,
                fixture.releaseAuthorizationId,
            );
            const idempotencyKey = await transferIdempotencyKey(fixture.paymentId, fixture.releaseAuthorizationId);
            fixture.resetRequests();

            const result = await successfulJson(await fixture.run("settlement-nonterminal-recovery", 1));

            expect(result).toEqual(expectedNonterminalRecoveryResponse(fixture));
            expect(fixture.rest.stripeRequests.map(({ method, pathname }) => [method, pathname])).toEqual([
                ["GET", "/v1/balance_settings"],
                ...providerReconciliationRequests,
                ["GET", "/v1/transfers"],
                ["POST", "/v1/transfers"],
            ]);
            expect(fixture.rest.stripeRequests.at(-1)).toEqual(transferCreateRequest(idempotencyKey));
            expect(fixture.rest.rows("financial_operations").find((row) => row.id === seed.operationId)).toMatchObject({
                status: "succeeded",
                stripe_object_id: "tr_1",
                attempt_count: 3,
                last_error: null,
            });
            expect(fixture.rest.rows("transfers").find((row) => row.id === seed.transferId)).toMatchObject({
                status: "succeeded",
                stripe_transfer_id: "tr_1",
            });
            expect(fixture.rest.rows("payments")[0]).toMatchObject({
                settlement_status: "released",
                transferred_amount: 1080,
            });
            expect(fixture.rest.rows("provider_exceptions")).toEqual([]);
            const databaseCalls = postgrestCalls(fixture);
            const claimIndex = databaseCalls.findIndex(([, table]) => table === "rpc/claim_financial_operations");
            expect(databaseCalls.slice(claimIndex)).toEqual(nonterminalRecoveryDatabaseCalls);
        });
    });
}

function releaseOperation(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>) {
    return fixture.rest.rows("financial_operations").find((row) => row.operation_type === "transfer_create")!;
}
function releaseTransfer(fixture: Awaited<ReturnType<typeof createSettlementReleaseFixture>>) {
    return fixture.rest
        .rows("transfers")
        .find((row) => row.release_authorization_id === fixture.releaseAuthorizationId)!;
}
