import { describe, expect, test } from "bun:test";
import {
    localStripeSimulationEnabled,
    simulateLocalStripeRequest,
} from "../../connectors/supabase/functions/cms-stripe-connect/shared/local-provider/index.ts";
import { reviveLocalPaymentIntent } from "../../connectors/supabase/functions/cms-stripe-connect/shared/local-provider/payment.ts";

describe("local Stripe provider simulation", () => {
    test("requires a local Supabase runtime, the private marker, and Ulvia-local test keys together", () => {
        const enabled = (
            marker: string | undefined,
            secret = "sk_test_ulvia_local_fixture",
            supabaseUrl = "http://kong:8000",
        ) =>
            localStripeSimulationEnabled(secret, "pk_test_ulvia_local_fixture", (name) =>
                name === "ULVIA_LOCAL_PROVIDER_SIMULATION" ? marker : supabaseUrl,
            );

        expect(enabled("v1")).toBe(true);
        expect(enabled(undefined)).toBe(false);
        expect(enabled("v1", "sk_live_ulvia_local_fixture")).toBe(false);
        expect(enabled("v1", "sk_test_ulvia_local_fixture", "https://project.supabase.co")).toBe(false);
        expect(
            localStripeSimulationEnabled("sk_test_ulvia_local_fixture", "pk_live_fixture", (name) =>
                name === "ULVIA_LOCAL_PROVIDER_SIMULATION" ? "v1" : "http://kong:8000",
            ),
        ).toBe(false);
    });

    test("creates a ready V2 account and a local onboarding session", async () => {
        const account = await simulateLocalStripeRequest(
            "v2",
            "/core/accounts",
            {
                method: "POST",
                body: JSON.stringify({ identity: { country: "fr" }, defaults: { currency: "eur" } }),
            },
            "local-account-alice",
        );
        const accountId = String(account.id);
        expect(accountId).toMatch(/^acct_local_/);
        expect(account).toMatchObject({
            dashboard: "none",
            defaults: { responsibilities: { requirements_collector: "application" } },
            configuration: {
                recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "active" } } } },
            },
            requirements: { entries: [] },
        });

        const form = new URLSearchParams({ account: accountId });
        const session = await simulateLocalStripeRequest("v1", "/account_sessions", {
            method: "POST",
            body: form,
        });
        expect(session).toMatchObject({ account: accountId, client_secret: expect.stringContaining("_secret") });
    });

    test("returns internally coherent succeeded payment truth and remembers payout settings", async () => {
        const form = new URLSearchParams({
            amount: "13900",
            currency: "eur",
            transfer_group: "cms_order_local",
            "metadata[cms_payment_id]": "42",
            "metadata[client_reference_id]": "order-local-42",
            "metadata[financial_terms_hash]": "a".repeat(64),
            "metadata[seller_cms_user_id]": "seller-local",
        });
        const intent = await simulateLocalStripeRequest("v1", "/payment_intents", {
            method: "POST",
            body: form,
        });
        const intentSnapshot = structuredClone(intent);
        const intentId = String(intent.id);
        expect(intent).toMatchObject({
            id: expect.stringMatching(/^pi_local_/),
            status: "succeeded",
            amount: 13900,
            amount_received: 13900,
            latest_charge: {
                paid: true,
                captured: true,
                amount: 13900,
                balance_transaction: { amount: 13900, net: 13650, fee: 250 },
            },
        });
        expect(reviveLocalPaymentIntent(intentId)).toEqual(intentSnapshot);

        const settings = new URLSearchParams({
            "payments[payouts][schedule][interval]": "daily",
            "payments[payouts][minimum_balance_by_currency][eur]": "12000",
        });
        await simulateLocalStripeRequest("v1", "/balance_settings", { method: "POST", body: settings });
        expect(await simulateLocalStripeRequest("v1", "/balance_settings", { method: "GET" })).toMatchObject({
            payments: { payouts: { schedule: { interval: "daily" }, minimum_balance_by_currency: { eur: 12000 } } },
        });
    });

    test("returns complete empty provider-object searches for a fresh local payment", async () => {
        for (const path of [
            "/disputes?charge=ch_local_fixture&limit=100",
            "/refunds?charge=ch_local_fixture&limit=100",
            "/transfers?transfer_group=cms_order_local&limit=100",
        ]) {
            expect(await simulateLocalStripeRequest("v1", path, { method: "GET" })).toEqual({
                object: "list",
                data: [],
                has_more: false,
                url: `/v1${path.split("?", 1)[0]}`,
            });
        }
    });
});
