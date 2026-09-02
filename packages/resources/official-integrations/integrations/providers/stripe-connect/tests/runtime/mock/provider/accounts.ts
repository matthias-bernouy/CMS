import { expect } from "bun:test";
import { jsonResponse } from "../../http";
import type { JsonRecord } from "../../types";
import { stripeAccountV1, stripeAccountV2 } from "../accounts";
import type { StripeConnectMock } from "../stripe-connect";

export async function handleStripeAccountRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
): Promise<Response | null> {
    if (url.pathname === "/v2/core/accounts" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        if ("account_token" in body) {
            expect(body).toMatchObject({
                account_token: "accttok_test_identity_123",
                dashboard: "none",
                identity: { country: "fr" },
                defaults: {
                    currency: "eur",
                    profile: { product_description: "Sale of second-hand goods between individuals." },
                    responsibilities: {
                        fees_collector: "application",
                        losses_collector: "application",
                    },
                },
                configuration: {
                    recipient: {
                        capabilities: {
                            stripe_balance: { stripe_transfers: { requested: true } },
                        },
                    },
                },
                include: ["configuration.recipient", "defaults", "identity", "requirements"],
                metadata: { cms_user_id: expect.any(String) },
            });
            expect(body).not.toHaveProperty("contact_email");
            expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_custom_recipient_v2_");
            const accountId = "acct_custom_identity_123";
            mock.customAccountIds.add(accountId);
            return jsonResponse(stripeAccountV2(accountId, "seller@example.com", true));
        }
        const email = String(body.contact_email ?? "unknown@example.com");
        expect(body).toMatchObject({
            dashboard: "none",
            identity: { country: "fr", entity_type: "individual" },
            defaults: {
                currency: "eur",
                profile: { product_description: "Sale of second-hand goods between individuals." },
                responsibilities: {
                    fees_collector: "application",
                    losses_collector: "application",
                },
            },
            configuration: {
                recipient: {
                    capabilities: {
                        stripe_balance: { stripe_transfers: { requested: true } },
                    },
                },
            },
        });
        expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_account_v2_controlled_recipient_v2_");
        expect(JSON.stringify(body)).not.toContain("requirements_collector");
        mock.accountCreationRequests.push({
            body,
            idempotencyKey: request.headers.get("idempotency-key"),
        });
        const accountId = `acct_${email.replace(/[^a-z0-9]+/gi, "_")}`;
        return jsonResponse(stripeAccountV2(accountId, email));
    }
    if (url.pathname.startsWith("/v2/core/accounts/") && method === "POST") {
        const accountId = decodeURIComponent(url.pathname.slice("/v2/core/accounts/".length));
        const body = JSON.parse(await request.text()) as JsonRecord;
        if ("account_token" in body) {
            expect(String(body.account_token)).toStartWith("accttok_");
            expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_custom_identity_");
            mock.accountUpdateRequests.push({
                accountId,
                body,
                idempotencyKey: request.headers.get("idempotency-key"),
            });
            mock.customAccountIds.add(accountId);
            return jsonResponse(stripeAccountV2(accountId, "seller@example.com", true));
        }
        expect(body).toMatchObject({
            dashboard: "none",
            defaults: {
                currency: "eur",
                profile: { product_description: "Sale of second-hand goods between individuals." },
                responsibilities: {
                    fees_collector: "application",
                    losses_collector: "application",
                },
            },
            configuration: {
                recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
            },
            include: ["configuration.recipient", "defaults", "identity", "requirements"],
        });
        expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_custom_controlled_recipient_v2_");
        expect(JSON.stringify(body)).not.toContain("requirements_collector");
        return jsonResponse(stripeAccountV2(accountId, "seller@example.com", true));
    }
    if (url.pathname.startsWith("/v2/core/accounts/") && method === "GET") {
        if (mock.nextAccountReadFailureStatus !== null) {
            const status = mock.nextAccountReadFailureStatus;
            mock.nextAccountReadFailureStatus = null;
            return jsonResponse(
                {
                    error: {
                        message: "provider authorization detail with sk_test_should_not_leak",
                    },
                },
                status,
            );
        }
        expect(url.searchParams.has("include[]")).toBe(false);
        expect(Array.from(url.searchParams.entries())).toEqual([
            ["include[0]", "configuration.recipient"],
            ["include[1]", "defaults"],
            ["include[2]", "identity"],
            ["include[3]", "requirements"],
        ]);
        const accountId = decodeURIComponent(url.pathname.slice("/v2/core/accounts/".length));
        const row = mock.tables.accounts.find((account) => account.stripe_account_id === accountId);
        const userId = String(row?.cms_user_id ?? "unknown");
        return jsonResponse({
            ...stripeAccountV2(accountId, `${userId}@example.com`, mock.customAccountIds.has(accountId)),
            ...mock.stripeAccountState.get(userId),
        });
    }
    if (url.pathname === "/v2/core/account_links" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        mock.accountLinkRequests.push(body);
        expect(body).toMatchObject({
            account: expect.stringContaining("acct_"),
            use_case: {
                type: "account_onboarding",
                account_onboarding: {
                    configurations: ["recipient"],
                    collection_options: { fields: "currently_due", future_requirements: "omit" },
                    return_url: "https://market.example/account/payouts",
                    refresh_url: "https://market.example/account/payouts",
                },
            },
        });
        return jsonResponse({
            object: "v2.core.account_link",
            url: "https://connect.stripe.test/onboard",
            expires_at: "2027-01-15T08:00:00.000Z",
        });
    }
    if (url.pathname.startsWith("/v1/accounts/") && method === "GET") {
        const accountId = decodeURIComponent(url.pathname.slice("/v1/accounts/".length));
        const row = mock.tables.accounts.find((account) => account.stripe_account_id === accountId);
        const userId = String(row?.cms_user_id ?? "unknown");
        return jsonResponse({
            ...stripeAccountV1(userId, accountId),
            ...mock.stripeAccountState.get(userId),
        });
    }
    return null;
}
