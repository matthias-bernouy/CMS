import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerSellerLabelTest(): void {
    test("keeps seller label access after handoff declaration but closes it on carrier acceptance", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const labelAuthorization = functionSql(
            schema,
            "get_order_label_authorization",
            "record_delivery_reconciliation_health",
        );

        expect(labelAuthorization).toContain("fulfillment.status in ('label_created', 'seller_handoff_declared')");
        expect(labelAuthorization).not.toContain("'carrier_accepted'");
    });
}
