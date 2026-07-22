import { describe, expect, test } from "bun:test";
import {
    clearRequests,
    createProtectedPayment,
    type CreateRepositoryBoundaryHarness,
    enrollSeller,
    postgrestBody,
    postgrestBudget,
    postgrestQuery,
    responseBody,
} from "./harness";

export function registerLedgerRepositoryContracts(createHarness: CreateRepositoryBoundaryHarness): void {
    describe("stripe-connect ledger repository contracts", () => {
        test("keeps settlement ledger reads and final payment update ordered", async () => {
            const harness = await createHarness();
            expect((await enrollSeller(harness)).status).toBe(200);
            const createdResponse = await createProtectedPayment(harness);
            expect(createdResponse.status).toBe(200);
            const created = await responseBody(createdResponse);
            harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));

            clearRequests(harness);
            const response = await harness.submit("", undefined, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "repository-release-1",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            });

            expect(response.status).toBe(200);
            expect(await responseBody(response)).toMatchObject({
                releaseAuthorizationId: "repository-release-1",
                stripeTransferId: "tr_1",
                status: "succeeded",
                amount: 1080,
                currency: "eur",
            });
            expect(postgrestBudget(harness)).toEqual([
                { method: "GET", table: "payments" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
                { method: "POST", table: "rpc/read_payment_reconciliation_local_context" },
                { method: "POST", table: "rpc/read_payment_reconciliation_ledger" },
                { method: "PATCH", table: "payments" },
                { method: "GET", table: "accounts" },
                { method: "GET", table: "transfers" },
                { method: "GET", table: "refunds" },
                { method: "POST", table: "rpc/reserve_financial_operation" },
                { method: "POST", table: "transfers" },
                { method: "PATCH", table: "financial_operations" },
                { method: "PATCH", table: "transfers" },
                { method: "PATCH", table: "transfers" },
                { method: "PATCH", table: "financial_operations" },
                { method: "GET", table: "transfers" },
                { method: "GET", table: "transfer_reversals" },
                { method: "GET", table: "refunds" },
                { method: "PATCH", table: "payments" },
            ]);
            expect(postgrestQuery(harness, 14)).toMatchObject({
                payment_id: `eq.${created.paymentId}`,
                status: "in.(succeeded,partially_reversed,reversed)",
                select: "amount,status",
            });
            expect(postgrestQuery(harness, 15)).toMatchObject({
                payment_id: `eq.${created.paymentId}`,
                status: "eq.succeeded",
                select: "amount",
            });
            expect(postgrestQuery(harness, 16)).toMatchObject({
                payment_id: `eq.${created.paymentId}`,
                status: "eq.succeeded",
                select: "seller_entitlement_reduction_amount",
            });
            expect(postgrestBody(harness, 17)).toEqual({
                transferred_amount: 1080,
                settlement_status: "released",
            });
        });
    });
}
