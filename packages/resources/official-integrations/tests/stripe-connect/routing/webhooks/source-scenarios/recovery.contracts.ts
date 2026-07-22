import { expect, test } from "bun:test";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { okJson } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerWebhookRecoverySourceScenario(createHarness: CreateHarness): void {
    test("reclaims a Stripe webhook abandoned by a crashed worker", async () => {
        const harness = await createHarness();
        harness.rest.seedAbandonedStripeEvent();

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "reclaim-abandoned-webhook",
                limit: 5,
            }),
        );

        expect(reconciliation).toMatchObject({ scannedCount: 1, exceptionCount: 0 });
        expect(harness.rest.rows("stripe_events")[0]).toMatchObject({
            processing_status: "ignored",
            processing_started_at: null,
            attempt_count: 2,
        });

        const schema = await Bun.file(
            new URL(
                "../../../../../integrations/stripe-connect/versions/1.0.0/connectors/supabase/schema.sql",
                import.meta.url,
            ),
        ).text();
        expect(schema).toContain("event.processing_status = 'processing'");
        expect(schema).toContain("event.processing_started_at <= now() - interval '5 minutes'");
        expect(schema).toContain("processing_started_at = now()");
    });
}
