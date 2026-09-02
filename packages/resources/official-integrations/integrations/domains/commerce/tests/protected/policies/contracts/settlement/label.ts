import { expect, test } from "bun:test";
import { functionSql, loadCommerceSchemaSql } from "../paths";

export function registerSellerLabelTest(): void {
    test("keeps seller label access after handoff declaration but closes it on carrier acceptance", async () => {
        const schema = await loadCommerceSchemaSql();
        const labelAuthorization = functionSql(
            schema,
            "get_order_label_authorization",
            "record_delivery_reconciliation_health",
        );

        expect(labelAuthorization).toContain("fulfillment.status in ('label_created', 'seller_handoff_declared')");
        expect(labelAuthorization).not.toContain("'carrier_accepted'");
    });
}
