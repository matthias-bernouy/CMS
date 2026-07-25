import { describe, expect, test } from "bun:test";
import {
    clearRequests,
    type CreateRepositoryBoundaryHarness,
    enrollSeller,
    marketplaceTermsHash,
    marketplaceTermsVersion,
    postgrestBody,
    postgrestBudget,
    postgrestQuery,
    responseBody,
} from "./harness";

export function registerAccountTermsRepositoryContracts(createHarness: CreateRepositoryBoundaryHarness): void {
    describe("stripe-connect account and terms repository contracts", () => {
        test("keeps the exact account sync and current-terms read boundary", async () => {
            const harness = await createHarness();
            expect((await enrollSeller(harness)).status).toBe(200);
            const accountUpserts = harness.rest.postgrestRequests.filter(
                ({ method, table }) => method === "POST" && table === "accounts",
            );
            expect(accountUpserts).toHaveLength(2);
            expect(accountUpserts.map(({ searchParams }) => Object.fromEntries(searchParams))).toEqual([
                expect.objectContaining({ on_conflict: "cms_user_id" }),
                expect.objectContaining({ on_conflict: "cms_user_id" }),
            ]);
            expect(accountUpserts.map(({ body }) => body)).toEqual([
                expect.objectContaining({
                    cms_user_id: "seller-1",
                    stripe_account_id: "acct_custom_identity_123",
                    stripe_account_api_version: "v2",
                    disabled_reason: null,
                }),
                expect.objectContaining({
                    cms_user_id: "seller-1",
                    stripe_account_id: "acct_custom_identity_123",
                    stripe_account_api_version: "v2",
                    disabled_reason: null,
                }),
            ]);
            const termsWrite = harness.rest.postgrestRequests.find(
                ({ table }) => table === "rpc/record_marketplace_terms_acceptance",
            );
            expect(termsWrite?.body).toEqual({
                p_cms_user_id: "seller-1",
                p_terms_version: marketplaceTermsVersion,
                p_terms_hash: marketplaceTermsHash,
            });
            expect(postgrestBudget(harness).slice(-2)).toEqual([
                { method: "POST", table: "rpc/record_marketplace_terms_acceptance" },
                { method: "GET", table: "accounts" },
            ]);

            clearRequests(harness);
            const response = await harness.submit("buyer-1", "admin", "checkSellerHeldPaymentEligibility", {
                sellerUserId: "seller-1",
                marketplaceTermsVersion,
                marketplaceTermsHash,
            });

            expect(response.status).toBe(200);
            expect(await responseBody(response)).toEqual({ eligible: true, reasonCode: "eligible" });
            expect(postgrestBudget(harness)).toEqual([
                { method: "POST", table: "rpc/get_current_marketplace_terms_configuration" },
                { method: "GET", table: "accounts" },
                { method: "GET", table: "accounts" },
                { method: "PATCH", table: "accounts" },
                { method: "GET", table: "marketplace_terms_acceptances" },
            ]);
            expect(postgrestQuery(harness, 1)).toMatchObject({ stripe_account_id: "eq.seller-1", limit: "1" });
            expect(postgrestQuery(harness, 2)).toMatchObject({ cms_user_id: "eq.seller-1", limit: "1" });
            expect(postgrestQuery(harness, 3)).toHaveProperty("cms_user_id", "eq.seller-1");
            expect(postgrestBody(harness, 3)).toEqual({
                stripe_account_id: "acct_custom_identity_123",
                application_controlled_recipient: true,
                terms_accepted: true,
                provider_account_closed: false,
                country: "FR",
                business_type: "individual",
                onboarding_status: "enabled",
                charges_enabled: false,
                payouts_enabled: false,
                details_submitted: true,
                disabled_reason: null,
                capabilities: {
                    stripe_balance: {
                        stripe_transfers: { status: "active", status_details: [] },
                        payouts: { status: "unrequested", status_details: [] },
                    },
                },
                requirements_currently_due: [],
                requirements_eventually_due: [],
                requirements_past_due: [],
                requirements_pending_verification: [],
                requirements_errors: [],
                future_requirements: { entries: [], summary: null },
            });
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
        });
    });
}
