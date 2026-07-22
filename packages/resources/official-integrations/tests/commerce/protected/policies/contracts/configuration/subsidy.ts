import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerPolicySubsidyTest(): void {
    test("refuses an economically uncovered policy unless an audited subsidy covers its deficit", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const createRevision = functionSql(schema, "create_c2c_policy_revision", "refresh_seller_risk_state");

        expect(createRevision).toContain("v_guaranteed_fee_floor");
        expect(createRevision).toContain("v_required_revenue_floor");
        expect(createRevision).toContain("fee fixed amount cannot exceed its maximum amount");
        expect(createRevision).toContain("buyerFeeMaximumAmount");
        expect(createRevision).toContain("sellerFeeMaximumAmount");
        expect(createRevision).toContain("guaranteed fee floor does not cover configured costs and minimum margin");
        expect(createRevision).toContain("audited subsidy maximum does not cover the configured policy deficit");
        expect(createRevision).toContain("insert into commerce.financial_subsidy_overrides");
    });
}
