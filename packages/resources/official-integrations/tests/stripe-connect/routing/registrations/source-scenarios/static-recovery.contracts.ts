import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../helpers/integrationDefinition";
import { loadSupabaseSchemaSql } from "../../../../helpers/supabaseSql";

export function registerStaticRecoverySourceScenario(): void {
    test("persists seller recovery exposure and blocks payments, releases, and unsafe payouts", async () => {
        const root = resolve(import.meta.dir, "../../../../../integrations/providers/stripe-connect/versions/1.0.0");
        const [schema, edge, paymentProjection, definition] = await Promise.all([
            loadSupabaseSchemaSql(root),
            Promise.all([
                readFile(resolve(root, "connectors/supabase/functions/cms-stripe-connect/index.ts"), "utf8"),
                readFile(
                    resolve(root, "connectors/supabase/functions/cms-stripe-connect/routes/payouts/seller-schedule.ts"),
                    "utf8",
                ),
                readFile(
                    resolve(
                        root,
                        "connectors/supabase/functions/cms-stripe-connect/workflows/payments/settlement-release.ts",
                    ),
                    "utf8",
                ),
                readFile(
                    resolve(
                        root,
                        "connectors/supabase/functions/cms-stripe-connect/workflows/payouts/seller-exposure.ts",
                    ),
                    "utf8",
                ),
            ]).then((sources) => sources.join("\n")),
            readFile(
                resolve(
                    root,
                    "connectors/supabase/functions/cms-stripe-connect/workflows/payments/projection-builders.ts",
                ),
                "utf8",
            ),
            loadIntegrationDefinition(resolve(root, "definition.json")).then(JSON.stringify),
        ]);

        expect(schema).toContain("stripe_connect.seller_recovery_exposures");
        expect(schema).toContain("stripe_connect.transfer_recovery_requests");
        expect(schema).toContain("reserve_transfer_recovery");
        expect(schema).toContain("exit when v_index >= 23");
        expect(schema).toContain("outstanding_debt_amount bigint not null default 0");
        expect(schema).toContain("upsert_seller_recovery_exposure_and_refresh");
        expect(schema).toContain("claim_seller_payout_hold");
        expect(schema).toContain("finalize_seller_payout_configuration");
        expect(schema).toContain("recover_transient_provider_truth_review");
        expect(schema).toContain("provider_payment_truth_revalidated");
        expect(schema).toContain("on stripe_connect.provider_exceptions(deduplication_key);");
        expect(schema).toContain("index_definition.indpred is not null");
        expect(schema).toContain("hashtextextended('stripe-connect-seller-risk:'");
        expect(schema).toContain(
            "actor_kind in ('system', 'webhook', 'reconciliation', 'support', 'finance', 'admin')",
        );
        expect(schema).toContain("first_actor_kind in ('finance', 'admin')");
        expect(schema).toContain("second_actor_kind in ('finance', 'admin')");
        expect(schema).toContain("if p_actor_kind is distinct from 'admin'");
        expect(edge).toContain("recordSellerRecoveryExposure");
        expect(edge).toContain("Their outage must");
        expect(edge).toContain("payout schedule change was superseded by seller financial risk");
        expect(edge).toContain("seller financial risk blocks settlement release");
        expect(edge).toContain("seller financial exposure requires a manual payout hold");
        expect(paymentProjection).toContain("settlementStatus: payment.settlement_status");
        expect(paymentProjection).toContain("manualReviewReason: payment.manual_review_reason");
        expect(edge).not.toContain('route === "/operations/refund"');
        expect(definition).not.toContain('"endpointId": "requestRefund"');
    });
}
