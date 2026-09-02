import { expect } from "bun:test";
import { jsonResponse } from "../../http";
import type { JsonRecord } from "../../types";
import type { StripeConnectMock } from "../stripe-connect";

export async function handleStripeBalanceRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
): Promise<Response | null> {
    if (url.pathname === "/v1/balance" && method === "GET") {
        expect(request.headers.get("stripe-account")).toBe("acct_seller_example_com");
        return jsonResponse({
            object: "balance",
            available: [{ amount: mock.availableEur, currency: "eur" }],
            pending: [
                { amount: 1800, currency: "eur" },
                { amount: 125, currency: "usd" },
            ],
            instant_available: [{ amount: 1000, currency: "eur" }],
            connect_reserved: [{ amount: 200, currency: "eur" }],
            livemode: false,
        });
    }
    if (url.pathname === "/v1/balance_settings" && method === "GET") {
        if (!request.headers.get("stripe-account") && mock.nextPlatformBalanceSettingsReadPause) {
            const pause = mock.nextPlatformBalanceSettingsReadPause;
            mock.nextPlatformBalanceSettingsReadPause = null;
            pause.entered();
            await pause.wait;
        }
        return jsonResponse(
            request.headers.get("stripe-account") ? mock.balanceSettings : mock.platformBalanceSettings,
        );
    }
    if (url.pathname === "/v1/balance_settings" && method === "POST") {
        const connectedAccount = request.headers.get("stripe-account");
        expect(request.headers.get("idempotency-key")).toStartWith(
            connectedAccount ? "cms:payout-schedule:" : "cms:platform-payout-protection:",
        );
        const params = new URLSearchParams(await request.text());
        mock.balanceSettingsUpdateCount++;
        if (connectedAccount && mock.failBalanceSettingsUpdates) {
            return jsonResponse({ error: { message: "balance settings unavailable" } }, 503);
        }
        if (connectedAccount && mock.nextSellerBalanceSettingsPause) {
            const pause = mock.nextSellerBalanceSettingsPause;
            mock.nextSellerBalanceSettingsPause = null;
            pause.entered();
            await pause.wait;
        }
        if (!connectedAccount && mock.nextPlatformBalanceSettingsPause) {
            const pause = mock.nextPlatformBalanceSettingsPause;
            mock.nextPlatformBalanceSettingsPause = null;
            pause.entered();
            await pause.wait;
        }
        const target = connectedAccount ? mock.balanceSettings : mock.platformBalanceSettings;
        const payments = target.payments as JsonRecord;
        const payouts = payments.payouts as JsonRecord;
        const settlement = payments.settlement_timing as JsonRecord;
        payouts.schedule = {
            interval: params.get("payments[payouts][schedule][interval]"),
            weekly_payout_days: params.getAll("payments[payouts][schedule][weekly_payout_days][]"),
            monthly_payout_days: params.getAll("payments[payouts][schedule][monthly_payout_days][]").map(Number),
        };
        const requestedMinimum = params.get("payments[payouts][minimum_balance_by_currency][eur]");
        if (requestedMinimum !== null) {
            const omitMinimum = mock.omitMinimumBalanceOnNextUpdate || Number(requestedMinimum) === 0;
            mock.omitMinimumBalanceOnNextUpdate = false;
            payouts.minimum_balance_by_currency = omitMinimum ? {} : { eur: Number(requestedMinimum) };
        }
        settlement.delay_days_override = Number(params.get("payments[settlement_timing][delay_days_override]"));
        payments.debit_negative_balances = params.get("payments[debit_negative_balances]") === "true";
        if (
            connectedAccount &&
            params.get("payments[payouts][schedule][interval]") === "daily" &&
            mock.addSellerRiskDuringNextAutomaticRestore
        ) {
            mock.addSellerRiskDuringNextAutomaticRestore = false;
            const account = mock.tables.accounts.find((row) => row.stripe_account_id === connectedAccount);
            if (account) {
                mock.update(account, {
                    financial_exposure_amount: 250,
                    risk_revision: Number(account.risk_revision ?? 0) + 1,
                    risk_status: "restricted",
                    financial_hold_reason: "Seller recovery exposure blocks payments and payouts",
                });
            }
        }
        if (connectedAccount && mock.loseNextSellerBalanceSettingsResponse) {
            mock.loseNextSellerBalanceSettingsResponse = false;
            return jsonResponse({ error: { message: "connection closed after Stripe committed the update" } }, 503);
        }
        if (!connectedAccount && mock.loseNextPlatformBalanceSettingsResponse) {
            mock.loseNextPlatformBalanceSettingsResponse = false;
            return jsonResponse({ error: { message: "connection closed after Stripe committed the update" } }, 503);
        }
        return jsonResponse(target);
    }
    if (/^\/v1\/payouts\/po_[^/]+$/.test(url.pathname) && method === "GET") {
        const payoutId = decodeURIComponent(url.pathname.slice("/v1/payouts/".length));
        const payout = mock.providerPayouts.get(payoutId);
        return payout ? jsonResponse(payout) : jsonResponse({ error: { message: "payout not found" } }, 404);
    }
    return null;
}
