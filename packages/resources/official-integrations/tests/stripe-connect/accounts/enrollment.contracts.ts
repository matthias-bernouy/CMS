import { describe, expect, test } from "bun:test";
import {
    accountQuery,
    clearRequests,
    type CreateAccountHandlerHarness,
    type JsonRecord,
    marketplaceTermsHash,
    responseBody,
} from "./harness";
import { expectedReloadRequests, nextTermsHash, nextTermsVersion, termsVersion } from "./enrollment-fixtures";

const inconsistentConsentCases: Array<{
    name: string;
    body: JsonRecord;
    error: string;
    accountReads: number;
    configurationReads: number;
}> = [
    {
        name: "rejects an explicitly false marketplace consent",
        body: {
            marketplaceTermsAccepted: false,
            marketplaceTermsVersion: termsVersion,
            marketplaceTermsHash,
        },
        error: "marketplaceTermsAccepted must be true when provided",
        accountReads: 0,
        configurationReads: 0,
    },
    {
        name: "rejects marketplace consent without its document identity",
        body: { marketplaceTermsAccepted: true },
        error: "marketplaceTermsVersion and marketplaceTermsHash are required with marketplaceTermsAccepted",
        accountReads: 0,
        configurationReads: 1,
    },
    {
        name: "rejects a marketplace terms version without its hash",
        body: { marketplaceTermsVersion: termsVersion },
        error: "marketplaceTermsVersion and marketplaceTermsHash must be provided together",
        accountReads: 0,
        configurationReads: 0,
    },
    {
        name: "rejects a marketplace terms hash without its version",
        body: { marketplaceTermsHash },
        error: "marketplaceTermsVersion and marketplaceTermsHash must be provided together",
        accountReads: 0,
        configurationReads: 0,
    },
];

export function registerAccountEnrollmentContracts(createHarness: CreateAccountHandlerHarness): void {
    describe("stripe-connect account enrollment contracts", () => {
        for (const contract of inconsistentConsentCases) {
            test(contract.name, async () => {
                const harness = await createHarness();
                const response = await harness.submit("user-123", "admin", "enrollConnectSeller", contract.body);

                expect(response.status).toBe(400);
                expect(await responseBody(response)).toEqual({ error: contract.error });
                expect(harness.rest.postgrestRequests).toEqual([
                    ...(contract.configurationReads
                        ? [
                              {
                                  method: "POST",
                                  table: "rpc/get_current_marketplace_terms_configuration",
                                  searchParams: [],
                                  body: {},
                              },
                          ]
                        : []),
                    ...(contract.accountReads
                        ? [{ method: "GET", table: "accounts", searchParams: accountQuery("user-123"), body: null }]
                        : []),
                ]);
                expect(harness.rest.externalRequestOrder).toEqual([
                    ...(contract.configurationReads
                        ? ["postgrest:POST:rpc/get_current_marketplace_terms_configuration"]
                        : []),
                    ...(contract.accountReads ? ["postgrest:GET:accounts"] : []),
                ]);
                expect(harness.rest.stripeRequests).toEqual([]);
                expect(harness.rest.rows("accounts")).toEqual([]);
                expect(harness.rest.rows("marketplace_terms_acceptances")).toEqual([]);
            });
        }

        test("returns the exact failure after terms persist but the enrolled account cannot be reloaded", async () => {
            const harness = await createHarness();
            const enrolled = await harness.submit("user-123", "admin", "enrollConnectSeller", {
                accountToken: "accttok_test_identity_123",
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: termsVersion,
                marketplaceTermsHash,
            });
            expect(enrolled.status).toBe(200);

            clearRequests(harness);
            harness.rest.failNextAccountReloadAfterTermsAcceptance();
            const response = await harness.submit("user-123", "admin", "enrollConnectSeller", {
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: nextTermsVersion,
                marketplaceTermsHash: nextTermsHash,
            });

            expect(response.status).toBe(502);
            expect(await responseBody(response)).toEqual({ error: "could not reload the enrolled seller account" });
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/get_current_marketplace_terms_configuration",
                "postgrest:GET:accounts",
                "stripe:GET:/v2/core/accounts/acct_custom_identity_123",
                "postgrest:PATCH:accounts",
                "postgrest:GET:marketplace_terms_acceptances",
                "postgrest:POST:rpc/record_marketplace_terms_acceptance",
                "postgrest:GET:accounts",
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                {
                    method: "GET",
                    pathname: "/v2/core/accounts/acct_custom_identity_123",
                    searchParams: [
                        ["include[0]", "configuration.recipient"],
                        ["include[1]", "defaults"],
                        ["include[2]", "identity"],
                        ["include[3]", "requirements"],
                    ],
                    idempotencyKey: null,
                    stripeAccount: null,
                },
            ]);
            expect(harness.rest.postgrestRequests).toEqual(expectedReloadRequests());
            expect(harness.rest.rows("marketplace_terms_acceptances")).toEqual([
                {
                    cms_user_id: "user-123",
                    terms_version: termsVersion,
                    terms_hash: marketplaceTermsHash,
                    accepted_at: "2026-07-06T12:03:00.000Z",
                },
                {
                    cms_user_id: "user-123",
                    terms_version: nextTermsVersion,
                    terms_hash: nextTermsHash,
                    accepted_at: "2026-07-06T12:03:00.000Z",
                },
            ]);
        });
    });
}
