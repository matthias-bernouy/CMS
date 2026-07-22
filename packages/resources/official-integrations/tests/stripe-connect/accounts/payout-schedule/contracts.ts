import { describe, expect, test } from "bun:test";
import { clearRequests, type CreateAccountHandlerHarness, responseBody } from "../harness";
import { expectedPayoutResponse, payoutCommand, payoutUserId, stripeAccountId } from "./expected";

export function registerPayoutScheduleContracts(createHarness: CreateAccountHandlerHarness): void {
    describe("stripe-connect seller payout schedule contracts", () => {
        test("preserves the exact DTO and provider/database order", async () => {
            const harness = await createHarness();
            harness.rest.seedPayoutScheduleAccount(payoutUserId, true);
            clearRequests(harness);

            const response = await harness.submit("system", undefined, "configureSellerPayoutSchedule", payoutCommand);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(String(body.refreshedAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            expect(body).toEqual(
                expectedPayoutResponse({
                    refreshedAt: String(body.refreshedAt),
                    providerOperationId: Number(body.providerOperationId),
                }),
            );
            expect(harness.rest.postgrestRequests.map(({ method, table }) => ({ method, table }))).toEqual(
                nominalDatabaseBudget(),
            );
            expect(harness.rest.externalRequestOrder).toEqual(nominalExternalOrder());
            expect(harness.rest.stripeRequests).toEqual([
                stripeRequest("GET", null),
                stripeRequest("POST", expect.stringMatching(/^cms:payout-schedule:/)),
            ]);
            expect(harness.rest.rows("financial_operations")).toEqual([
                expect.objectContaining({
                    business_key: `payout-schedule:${payoutUserId}:payout-contract-1`,
                    operation_type: "payout_schedule_update",
                    status: "succeeded",
                    attempt_count: 1,
                }),
            ]);
        });
    });
}

function nominalDatabaseBudget(): Array<{ method: string; table: string }> {
    return [
        { method: "GET", table: "accounts" },
        { method: "POST", table: "rpc/claim_seller_payout_hold" },
        { method: "POST", table: "rpc/reserve_account_financial_operation" },
        { method: "PATCH", table: "financial_operations" },
        { method: "POST", table: "rpc/finalize_seller_payout_configuration" },
        { method: "PATCH", table: "financial_operations" },
    ];
}

function nominalExternalOrder(): string[] {
    return [
        "postgrest:GET:accounts",
        "postgrest:POST:rpc/claim_seller_payout_hold",
        "postgrest:POST:rpc/reserve_account_financial_operation",
        "stripe:GET:/v1/balance_settings",
        "postgrest:PATCH:financial_operations",
        "stripe:POST:/v1/balance_settings",
        "postgrest:POST:rpc/finalize_seller_payout_configuration",
        "postgrest:PATCH:financial_operations",
    ];
}

function stripeRequest(method: string, idempotencyKey: unknown): Record<string, unknown> {
    return {
        method,
        pathname: "/v1/balance_settings",
        searchParams: [],
        idempotencyKey,
        stripeAccount: stripeAccountId,
    };
}
