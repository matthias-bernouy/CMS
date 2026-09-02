import { describe, expect, test } from "bun:test";
import { accountQuery, accountSelect, type CreateAccountHandlerHarness, responseBody } from "./harness";
import {
    adminIdempotencyKey,
    expectedAccountCreation,
    expectedAccountLink,
    expectedAccountUpsert,
    expectedResponse,
} from "./onboarding-fixtures";

const functionsBaseUrl = "https://project.supabase.co/functions/v1";

export function registerAccountOnboardingContracts(createHarness: CreateAccountHandlerHarness): void {
    describe("stripe-connect account onboarding contracts", () => {
        test("preserves the direct administrator onboarding response and provider/database order", async () => {
            const harness = await createHarness();
            const response = await harness.edgeRequest(
                new Request(
                    `${functionsBaseUrl}/cms-stripe-connect/admin/accounts/account/onboarding?userId=seller-admin`,
                    {
                        method: "POST",
                        headers: {
                            authorization: `Bearer ${harness.apiKey}`,
                            "content-type": "application/json",
                        },
                        body: JSON.stringify({
                            email: "seller-admin@example.com",
                            displayName: "Seller Admin",
                            country: "FR",
                            returnUrl: "https://market.example/account/payouts",
                            refreshUrl: "https://market.example/account/payouts",
                        }),
                    },
                ),
            );

            expect(response.status).toBe(200);
            const body = await responseBody(response);
            expect(body.lastOnboardingStartedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
            expect(body).toEqual(expectedResponse(String(body.lastOnboardingStartedAt)));
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:GET:accounts",
                "stripe:POST:/v2/core/accounts",
                "postgrest:POST:accounts",
                "stripe:POST:/v2/core/account_links",
                "postgrest:PATCH:accounts",
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                stripeRequest("/v2/core/accounts", adminIdempotencyKey),
                stripeRequest("/v2/core/account_links", null),
            ]);
            expect(harness.rest.accountCreationRequests).toEqual([
                {
                    idempotencyKey: adminIdempotencyKey,
                    body: expectedAccountCreation(),
                },
            ]);
            expect(harness.rest.accountLinkRequests).toEqual([expectedAccountLink()]);
            expect(harness.rest.postgrestRequests).toEqual([
                { method: "GET", table: "accounts", searchParams: accountQuery("seller-admin"), body: null },
                {
                    method: "POST",
                    table: "accounts",
                    searchParams: [
                        ["on_conflict", "cms_user_id"],
                        ["select", accountSelect],
                    ],
                    body: expectedAccountUpsert(),
                },
                {
                    method: "PATCH",
                    table: "accounts",
                    searchParams: [
                        ["cms_user_id", "eq.seller-admin"],
                        ["select", accountSelect],
                    ],
                    body: {
                        onboarding_status: "link_created",
                        last_onboarding_started_at: body.lastOnboardingStartedAt,
                    },
                },
            ]);
        });
    });
}

function stripeRequest(pathname: string, idempotencyKey: string | null) {
    return { method: "POST", pathname, searchParams: [], idempotencyKey, stripeAccount: null };
}
