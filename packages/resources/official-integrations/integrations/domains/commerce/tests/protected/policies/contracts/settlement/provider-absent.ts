import { expect, test } from "bun:test";
import { functionSql, loadCommerceSchemaSql } from "../paths";

export function registerProviderAbsentCancellationTest(): void {
    test("finalizes provider-absent cancellation without creating a fake payment liability", async () => {
        const schema = await loadCommerceSchemaSql();
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

        expect(absent).toContain("v_attempt.status = 'created'");
        expect(absent).toContain("v_attempt.provider_payment_id is not null");
        expect(absent).toContain("v_attempt.provider_payment_intent_id is not null");
        expect(absent).toContain("v_attempt.provider_charge_id is not null");
        expect(absent).toContain("'cancelledBeforeProviderCreation', true");
        expect(absent).toContain("payment_attempt_cancelled_before_provider_creation");
        expect(absent).toContain("absent provider truth cannot finalize an order with a payment attempt");
        expect(absent).toContain("payment_cancellation_provider_absent");
        expect(absent).toContain("v_idempotent_replay := v_event_id is null");
        expect(absent).not.toContain("if v_event_id is null then\n        return");
        expect(absent).toContain("Re-apply terminal invariants for legacy partially completed cancellations");
        expect(absent).toContain("perform commerce.restore_order_inventory(v_order.id)");
        expect(absent).not.toContain("insert into commerce.order_payment_attempts");
        expect(prepare).toContain("v_order.id, 'provisional', null");
        expect(absent).toContain("v_order.id, 'released', null");
        expect(absent).toContain("set status = 'released'");
        expect(absent).toContain("authorized_seller_amount = 0");
        expect(absent).toContain("seller_reserve_liability_remaining_amount = 0");
        expect(absent).toContain("platform_gross_remainder_amount = 0");
        expect(absent).toContain("update commerce.seller_financial_exposures");
        expect(absent).toContain("status = 'recovered'");
        expect(absent).toContain("perform commerce.refresh_seller_risk_state(v_order.seller_id)");
        expect(absent).toContain("Provider-absent payment cancellation released prospective liability");
        expect(aggregate).toContain("terms.platform_risk_reserve_contribution_amount");
    });
}
