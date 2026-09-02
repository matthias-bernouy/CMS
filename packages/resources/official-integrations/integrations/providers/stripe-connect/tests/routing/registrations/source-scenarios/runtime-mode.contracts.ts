import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../../runtime/constants";
import { activeEnv } from "../../../runtime/environment";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { stripeSignature } from "../../../runtime/http";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerRuntimeModeSourceScenarios(createHarness: CreateHarness): void {
    test("fails before mutation when Stripe secret and publishable key modes diverge", async () => {
        const harness = await createHarness();
        const originalSecret = activeEnv.STRIPE_SECRET_KEY;
        const originalPublishable = activeEnv.STRIPE_PUBLISHABLE_KEY;
        try {
            activeEnv.STRIPE_SECRET_KEY = "sk_test_mode_guard";
            activeEnv.STRIPE_PUBLISHABLE_KEY = "pk_live_mode_guard";
            const mismatched = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/connect/config`, {
                    headers: {
                        authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
                        "x-user-id": "buyer-mode-guard",
                    },
                }),
            );
            expect(mismatched.status).toBe(500);
            expect(await mismatched.json()).toEqual({
                error: "Stripe secret and publishable keys must use the same explicit test or live mode",
            });
            expect(harness.rest.rows("accounts")).toHaveLength(0);
            expect(harness.rest.rows("payments")).toHaveLength(0);
        } finally {
            activeEnv.STRIPE_SECRET_KEY = originalSecret;
            activeEnv.STRIPE_PUBLISHABLE_KEY = originalPublishable;
        }
    });

    test("rejects livemode mismatch on every signed Stripe webhook boundary", async () => {
        const harness = await createHarness();
        const created = Math.floor(Date.now() / 1000);
        const cases = [
            {
                route: "stripe",
                secret: "whsec_test_123",
                event: {
                    id: "evt_live_platform_mismatch",
                    type: "payment_intent.created",
                    api_version: "2026-02-25.clover",
                    created,
                    livemode: true,
                    data: { object: { id: "pi_live_mismatch" } },
                },
            },
            {
                route: "stripe-connect",
                secret: "whsec_connect_test_456",
                event: {
                    id: "evt_live_connect_mismatch",
                    type: "payout.created",
                    api_version: "2026-02-25.clover",
                    created,
                    livemode: true,
                    account: "acct_live_mismatch",
                    data: { object: { id: "po_live_mismatch" } },
                },
            },
            {
                route: "stripe-connect-v2",
                secret: "whsec_connect_v2_test_789",
                event: {
                    id: "evt_live_connect_v2_mismatch",
                    type: "v2.core.account.updated",
                    created,
                    livemode: true,
                    related_object: { type: "v2.core.account", id: "acct_live_v2_mismatch" },
                    data: { object: {} },
                },
            },
        ];
        for (const item of cases) {
            const payload = JSON.stringify(item.event);
            const signature = await stripeSignature(payload, item.secret);
            const response = await harness.edgeRequest(
                new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/${item.route}`, {
                    method: "POST",
                    headers: { "stripe-signature": signature },
                    body: payload,
                }),
            );
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({
                error: "Stripe webhook livemode does not match configured API keys",
            });
        }
        expect(harness.rest.rows("stripe_events")).toHaveLength(0);
    });
}
