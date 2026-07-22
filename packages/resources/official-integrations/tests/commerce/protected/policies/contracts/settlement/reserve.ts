import { expect, test } from "bun:test";
import { loadCommerceSchemaSql } from "../paths";

export function registerSellerReserveTest(): void {
    test("keeps a non-zero seller reserve as a later releasable liability", async () => {
        const schema = await loadCommerceSchemaSql();

        expect(schema).toContain("'eur', 1000,\n    14, 120");
        expect(schema).toContain("v_order.id, v_terms.seller_proceeds_amount");
        expect(schema).toContain("release_kind in ('initial', 'reserve')");
        expect(schema).toContain("authorize_order_reserve_release");
        expect(schema).toContain("risk.reserve_liability_days");
        expect(schema).toContain("seller_reserve_liability_remaining_amount <= authorized_seller_amount");
    });
}
