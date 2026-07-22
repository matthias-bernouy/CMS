import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerSellerDebtTest(): void {
    test("persists unrecovered seller debt without clearing independent review on dispute win", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const dispute = functionSql(schema, "record_order_stripe_dispute_projection", "request_order_cancellation");

        expect(schema).toContain("commerce.seller_financial_exposures");
        expect(schema).toContain("'reversal_failure', 'debt'");
        expect(dispute).toContain("'chargeback:' || p_provider_dispute_id");
        expect(dispute).toContain("and status <> 'manual_review'");
        expect(dispute).toContain("manual_review_reason like 'stripe_dispute_%'");
    });
}
