import { expect, test } from "bun:test";
import { resolve } from "node:path";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { okJson } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import { loadSupabaseSchemaSql } from "../../../../../../../tests/helpers/supabaseSql";

const integrationRoot = resolve(import.meta.dir, "../../../..");

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

        const schema = await loadSupabaseSchemaSql(integrationRoot);
        expect(schema).toContain("event.processing_status = 'processing'");
        expect(schema).toContain("event.processing_started_at <= now() - interval '5 minutes'");
        expect(schema).toContain("processing_started_at = now()");
    });
}
