import { expect, test } from "bun:test";
import { functionSql, loadCommerceSchemaSql } from "../paths";

export function registerRefundBoundariesTest(): void {
    test("bounds platform-funded claim refunds and only terminalizes confirmed provider outcomes", async () => {
        const schema = await loadCommerceSchemaSql();
        const createRefund = functionSql(schema, "create_allocated_refund_request", "refund_authorization_payload");
        const resolver = functionSql(schema, "resolve_allocated_marketplace_claim", "resolve_marketplace_claim");
        const projection = functionSql(
            schema,
            "record_order_settlement_projection",
            "record_order_stripe_dispute_projection",
        );

        expect(createRefund).toContain("v_terms.platform_retained_amount - v_terms.buyer_protection_fee_amount");
        expect(createRefund).toContain("requested_amount - protection_fee_refund_amount - seller_recovery_amount");
        expect(createRefund).toContain("status not in ('rejected', 'cancelled', 'failed')");
        expect(createRefund).toContain("cumulative platform-funded refund exceeds immutable platform contribution");
        expect(resolver).toContain(
            "(v_refund->>'requested_amount')::bigint\n                - (v_refund->>'protection_fee_refund_amount')::bigint",
        );
        expect(resolver).toContain("'platformContributionAmount', coalesce(v_platform_contribution, 0)");
        expect(projection).toContain(
            "when total_refunded_amount + p_amount = v_terms.buyer_total_amount then 'refunded'",
        );
        expect(projection).toContain("else 'held' end");
        expect(projection).not.toContain("when authorized_seller_amount > 0 then 'held'");
        expect(projection).toContain("if v_refund.claim_id is not null then");
        expect(projection).toContain("update commerce.orders set status = 'completed'");
        expect(projection).toContain("claim.status in ('resolved_buyer', 'resolved_split')");
        const claimBranchStart = projection.indexOf("if v_refund.claim_id is not null then");
        const cancellationBranchStart = projection.indexOf("\n            else", claimBranchStart);
        expect(claimBranchStart).toBeGreaterThanOrEqual(0);
        expect(cancellationBranchStart).toBeGreaterThan(claimBranchStart);
        expect(projection.slice(claimBranchStart, cancellationBranchStart)).not.toContain("restore_order_inventory");
    });
}
