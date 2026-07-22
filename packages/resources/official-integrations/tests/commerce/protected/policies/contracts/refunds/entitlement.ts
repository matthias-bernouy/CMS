import { expect, test } from "bun:test";
import { functionSql, loadCommerceSchemaSql } from "../paths";

export function registerClaimEntitlementTest(): void {
    test("resolves later claims from the current locked seller entitlement", async () => {
        const schema = await loadCommerceSchemaSql();
        const resolver = functionSql(schema, "resolve_marketplace_claim", "request_order_refund");

        expect(resolver).toContain("p_seller_transfer_amount > v_settlement.authorized_seller_amount");
        expect(resolver).toContain("v_settlement.authorized_seller_amount - p_seller_transfer_amount");
        expect(resolver).not.toContain("v_terms.seller_proceeds_amount - p_seller_transfer_amount");
    });
}
