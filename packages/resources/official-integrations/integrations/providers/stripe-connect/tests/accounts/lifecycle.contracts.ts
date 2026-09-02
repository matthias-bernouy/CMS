import { describe, expect, test } from "bun:test";
import { accountQuery, type CreateAccountHandlerHarness, responseBody } from "./harness";

export function registerAccountLifecycleContracts(createHarness: CreateAccountHandlerHarness): void {
    describe("stripe-connect account lifecycle contracts", () => {
        test("refuses to replace a fully active legacy account during seller verification", async () => {
            const harness = await createHarness();
            harness.rest.seedActiveLegacyAccount("user-123");
            const before = harness.rest.rows("accounts");

            const response = await harness.submit("user-123", "admin", "submitConnectVerification", {
                accountToken: "accttok_test_identity_123",
            });

            expect(response.status).toBe(409);
            expect(await responseBody(response)).toEqual({
                error: "A fully active legacy Stripe account cannot be replaced through seller verification",
            });
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:GET:accounts",
                "stripe:GET:/v1/accounts/acct_user_123_active_legacy",
            ]);
            expect(harness.rest.postgrestRequests).toEqual([
                { method: "GET", table: "accounts", searchParams: accountQuery("user-123"), body: null },
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                {
                    method: "GET",
                    pathname: "/v1/accounts/acct_user_123_active_legacy",
                    searchParams: [],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
            ]);
            expect(harness.rest.accountCreationRequests).toEqual([]);
            expect(harness.rest.rows("accounts")).toEqual(before);
        });
    });
}
