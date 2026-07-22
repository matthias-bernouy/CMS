import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerProviderAbsentCancellationTest(): void {
    test("finalizes provider-absent cancellation without creating a fake payment liability", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const absent = functionSql(
            schema,
            "record_absent_order_payment_cancellation",
            "record_order_payment_projection",
        );
        const prepare = functionSql(schema, "prepare_protected_payment", "ensure_payment_cancellation_request");
        const aggregate = schema.slice(
            schema.indexOf("create or replace view commerce.platform_payout_order_contribution_projection"),
            schema.indexOf("create or replace function commerce.authorize_platform_payout_liability_decrease("),
        );

        expect(absent).toContain("absent provider truth cannot finalize an order with a payment attempt");
        expect(absent).toContain("payment_cancellation_provider_absent");
        expect(absent).toContain("perform commerce.restore_order_inventory(v_order.id)");
        expect(absent).not.toContain("insert into commerce.order_payment_attempts");
        expect(prepare).toContain("v_order.id, 'provisional', null");
        expect(absent).toContain("v_order.id, 'released', null");
        expect(absent).toContain("Provider-absent payment cancellation released prospective liability");
        expect(aggregate).toContain("terms.platform_risk_reserve_contribution_amount");
    });
}
