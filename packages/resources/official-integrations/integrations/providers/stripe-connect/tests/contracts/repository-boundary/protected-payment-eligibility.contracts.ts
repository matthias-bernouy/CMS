import { describe, expect, test } from "bun:test";
import {
    clearRequests,
    type CreateRepositoryBoundaryHarness,
    enrollSeller,
    marketplaceTermsHash,
    marketplaceTermsVersion,
    postgrestBudget,
    postgrestQuery,
    responseBody,
} from "./harness";

const eligibilityBody = {
    sellerUserId: "seller-1",
    marketplaceTermsVersion,
    marketplaceTermsHash,
};

export function registerProtectedPaymentEligibilityContracts(createHarness: CreateRepositoryBoundaryHarness): void {
    describe("stripe-connect protected payment eligibility boundaries", () => {
        test("returns buyer_is_seller after resolving authoritative terms but before reading an acceptance", async () => {
            const harness = await createHarness();
            expect((await enrollSeller(harness)).status).toBe(200);
            clearRequests(harness);

            const response = await harness.submit(
                "seller-1",
                "admin",
                "checkSellerHeldPaymentEligibility",
                eligibilityBody,
            );

            expect(response.status).toBe(200);
            expect(await responseBody(response)).toEqual({ eligible: false, reasonCode: "buyer_is_seller" });
            expect(postgrestBudget(harness)).toEqual([
                { method: "POST", table: "rpc/get_current_marketplace_terms_configuration" },
                { method: "GET", table: "accounts" },
                { method: "GET", table: "accounts" },
                { method: "PATCH", table: "accounts" },
            ]);
            expect(postgrestQuery(harness, 1)).toMatchObject({ stripe_account_id: "eq.seller-1", limit: "1" });
            expect(postgrestQuery(harness, 2)).toMatchObject({ cms_user_id: "eq.seller-1", limit: "1" });
            expect(harness.rest.stripeRequests).toEqual([
                expect.objectContaining({
                    method: "GET",
                    pathname: "/v2/core/accounts/acct_custom_identity_123",
                }),
            ]);
            expect(harness.rest.rows("payments")).toEqual([]);
            expect(harness.rest.rows("financial_operations")).toEqual([]);
        });

        test("returns seller_account_not_ready only after current terms are confirmed", async () => {
            const harness = await createHarness();
            expect((await enrollSeller(harness)).status).toBe(200);
            harness.rest.setAccountState("seller-1", { financial_exposure_amount: 100 });
            clearRequests(harness);

            const response = await harness.submit(
                "buyer-1",
                "admin",
                "checkSellerHeldPaymentEligibility",
                eligibilityBody,
            );

            expect(response.status).toBe(200);
            expect(await responseBody(response)).toEqual({
                eligible: false,
                reasonCode: "seller_account_not_ready",
            });
            expect(postgrestBudget(harness)).toEqual([
                { method: "POST", table: "rpc/get_current_marketplace_terms_configuration" },
                { method: "GET", table: "accounts" },
                { method: "GET", table: "accounts" },
                { method: "PATCH", table: "accounts" },
                { method: "GET", table: "marketplace_terms_acceptances" },
            ]);
            expect(postgrestQuery(harness, 4)).toEqual({
                cms_user_id: "eq.seller-1",
                terms_version: `eq.${marketplaceTermsVersion}`,
                terms_hash: `eq.${marketplaceTermsHash}`,
                select: "cms_user_id,terms_version,terms_hash,accepted_at",
                limit: "1",
            });
            expect(harness.rest.stripeRequests).toEqual([
                expect.objectContaining({
                    method: "GET",
                    pathname: "/v2/core/accounts/acct_custom_identity_123",
                }),
            ]);
            expect(harness.rest.rows("payments")).toEqual([]);
            expect(harness.rest.rows("financial_operations")).toEqual([]);
        });
    });
}
