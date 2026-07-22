import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerSellerRiskTest(): void {
    test("applies seller velocity, value, claim, chargeback, and debt gates", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const riskGate = functionSql(schema, "assert_order_seller_risk", "lock_order_financial_terms");

        expect(riskGate).toContain("outstanding_debt_amount");
        expect(riskGate).toContain("high_value_review_amount");
        expect(riskGate).toContain("velocity_limit_amount");
        expect(riskGate).toContain("claim_ratio_review_bps");
        expect(riskGate).toContain("chargeback_ratio_review_bps");
        expect(riskGate).toContain("pg_advisory_xact_lock");
        expect(riskGate).toContain("'commerce-seller-risk:'");
        expect(riskGate).toContain("prior_order.status = 'awaiting_payment'");
        expect(riskGate).toContain("attempt.status in ('created', 'requires_action', 'processing')");
        const lockTerms = functionSql(schema, "lock_order_financial_terms", "prepare_protected_payment");
        expect(lockTerms).toContain("from commerce.sellers where id = v_order.seller_id for update");
        expect(lockTerms).toContain("pg_advisory_xact_lock");
        expect(schema).toContain("perform commerce.assert_order_seller_risk(v_order.id, 'payment preparation')");
        expect(schema).toContain("perform commerce.assert_order_seller_risk(v_order.id, 'settlement release')");
    });
}
