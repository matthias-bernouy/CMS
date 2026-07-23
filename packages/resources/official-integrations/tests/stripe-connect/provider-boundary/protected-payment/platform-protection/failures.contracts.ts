import { describe, expect, test } from "bun:test";
import { type CreateProviderBoundaryHarness, postgrestBody, postgrestBudget, responseBody } from "../../harness";
import { directSubmit } from "./validation.contracts";

export function registerPlatformPayoutProtectionFailureContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect platform payout protection failure contracts", () => {
        test("preserves ambiguous provider failure effects and cleanup order", async () => {
            const harness = await createHarness();
            harness.rest.loseNextPlatformPayoutProtectionResponse();

            const response = await directSubmit(harness, {
                platformPayoutControlChangeId: "platform-provider-failure",
                minimumBalanceEur: 350,
                liabilityRevision: 1,
                debitNegativeBalances: true,
            });

            expect(response.status).toBe(502);
            expect(await responseBody(response)).toEqual({
                error: "provider request failed",
            });
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/claim_platform_payout_protection",
                "stripe:GET:/v1/balance_settings",
                "postgrest:POST:rpc/reserve_platform_financial_operation",
                "postgrest:PATCH:financial_operations",
                "stripe:POST:/v1/balance_settings",
                "postgrest:PATCH:financial_operations",
                "postgrest:POST:rpc/complete_platform_payout_protection",
                "postgrest:POST:provider_exceptions",
            ]);
            expect(postgrestBudget(harness)).toEqual([
                { method: "POST", table: "rpc/claim_platform_payout_protection" },
                { method: "POST", table: "rpc/reserve_platform_financial_operation" },
                { method: "PATCH", table: "financial_operations" },
                { method: "PATCH", table: "financial_operations" },
                { method: "POST", table: "rpc/complete_platform_payout_protection" },
                { method: "POST", table: "provider_exceptions" },
            ]);
            const owner = postgrestBody(harness, 0).p_owner;
            expect(postgrestBody(harness, 3)).toEqual({
                status: "manual_review",
                last_error: "connection closed after Stripe committed the update",
            });
            expect(postgrestBody(harness, 4)).toEqual({
                p_owner: owner,
                p_expected_liability_revision: 1,
                p_applied_minimum_amount: 350,
                p_succeeded: false,
                p_error: "connection closed after Stripe committed the update",
            });
            expect(postgrestBody(harness, 5)).toEqual({
                operation_id: 1,
                exception_type: "platform_payout_protection_ambiguous",
                severity: "critical",
                message: "connection closed after Stripe committed the update",
                details: {
                    platformPayoutControlChangeId: "platform-provider-failure",
                    requestedMinimumBalanceEur: 350,
                    liabilityRevision: 1,
                },
            });
            expect(harness.rest.rows("financial_operations")).toEqual([
                expect.objectContaining({
                    id: 1,
                    status: "manual_review",
                    response: null,
                    last_error: "connection closed after Stripe committed the update",
                    attempt_count: 1,
                }),
            ]);
            expect(harness.rest.rows("platform_payout_controls")).toEqual([
                expect.objectContaining({
                    liability_revision: 1,
                    required_minimum_amount: 350,
                    provider_minimum_amount: 0,
                    claim_owner: null,
                    last_error: "connection closed after Stripe committed the update",
                }),
            ]);
            expect(harness.rest.balanceSettingsUpdateCount).toBe(1);
        });
    });
}
