import { expect } from "bun:test";
import { jsonResponse } from "../../http";
import type { StripeConnectMock } from "../stripe-connect";

export async function handleStripePayoutRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
): Promise<Response | null> {
    if (url.pathname === "/v1/payouts" && method === "POST") {
        expect(request.headers.get("stripe-account")).toBe("acct_seller_example_com");
        expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_payout_");
        const params = new URLSearchParams(await request.text());
        expect(params.get("amount")).toBe(String(mock.availableEur));
        expect(params.get("currency")).toBe("eur");
        expect(params.get("method")).toBe("standard");
        const amount = mock.availableEur;
        mock.availableEur = 0;
        return jsonResponse({
            id: "po_test_1",
            amount,
            currency: "eur",
            status: "pending",
            arrival_date: 1800000000,
        });
    }
    if (/^\/v1\/accounts\/[^/]+\/external_accounts$/.test(url.pathname) && method === "POST") {
        const params = new URLSearchParams(await request.text());
        expect(params.get("external_account")).toBe("btok_test_iban_123");
        expect(params.get("default_for_currency")).toBe("true");
        expect(request.headers.get("idempotency-key")).toStartWith("cms_connect_bank_");
        const accountId = decodeURIComponent(url.pathname.split("/")[3] ?? "");
        const row = mock.tables.accounts.find((account) => account.stripe_account_id === accountId);
        const userId = String(row?.cms_user_id ?? "unknown");
        mock.stripeAccountState.set(userId, {
            configuration: {
                recipient: {
                    applied: true,
                    capabilities: {
                        stripe_balance: {
                            stripe_transfers: { status: "active", status_details: [] },
                            payouts: { status: "active", status_details: [] },
                        },
                    },
                },
            },
        });
        return jsonResponse({
            id: "ba_test_123",
            object: "bank_account",
            country: "FR",
            currency: "eur",
            last4: "0123",
        });
    }
    if (url.pathname === "/v1/account_sessions" && method === "POST") {
        const params = new URLSearchParams(await request.text());
        expect(Array.from(params.entries())).toEqual([
            ["account", expect.stringContaining("acct_")],
            ["components[account_onboarding][enabled]", "true"],
        ]);
        const accountId = params.get("account") || "acct_unknown";
        const row = mock.tables.accounts.find((account) => account.stripe_account_id === accountId);
        return jsonResponse({
            account: accountId,
            client_secret: `as_${row?.cms_user_id ?? "unknown"}_secret`,
            expires_at: 1800000000,
        });
    }
    if (url.pathname === "/v1/account_links" && method === "POST") {
        const params = new URLSearchParams(await request.text());
        expect(params.get("account")).toStartWith("acct_");
        expect(params.get("type")).toBe("account_onboarding");
        expect(params.get("return_url")).toBe("https://market.example/account/payouts");
        expect(params.get("refresh_url")).toBe("https://market.example/account/payouts");
        return jsonResponse({
            url: "https://connect.stripe.test/onboard",
            expires_at: 1800000000,
        });
    }
    return null;
}
