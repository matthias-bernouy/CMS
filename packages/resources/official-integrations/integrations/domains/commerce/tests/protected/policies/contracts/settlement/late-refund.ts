import { expect, test } from "bun:test";
import { functionSql, loadCommerceSchemaSql } from "../paths";

export function registerLatePaymentRefundTerminalizationTest(): void {
    test("terminalizes late-payment cancellation after a full protected refund", async () => {
        const schema = await loadCommerceSchemaSql();
        const paymentProjection = functionSql(
            schema,
            "record_order_payment_projection",
            "record_order_fulfillment_projection",
        );
        const settlementProjection = functionSql(
            schema,
            "record_order_settlement_projection",
            "record_order_stripe_dispute",
        );
        const lateSuccess = paymentProjection.slice(
            paymentProjection.indexOf("v_late_refund_key :="),
            paymentProjection.indexOf("elsif p_status = 'succeeded' then"),
        );

        expect(lateSuccess).toContain("v_payment_already_fully_refunded :=");
        expect(lateSuccess).toContain("v_settlement.status = 'refunded'");
        expect(lateSuccess).toContain("v_settlement.total_refunded_amount = v_terms.buyer_total_amount");
        expect(lateSuccess).toContain("then 'completed' else 'refund_pending'");
        expect(lateSuccess).toContain("perform commerce.restore_order_inventory(v_order.id)");
        expect(lateSuccess).toContain("status = v_cancellation.target_order_status");
        expect(lateSuccess).toContain("status = 'cancelled'");
        expect(lateSuccess).toContain("'order_cancelled_after_full_refund'");
        expect(lateSuccess).toContain("resolved_by = 'late-payment-compensation'");
        expect(lateSuccess).toContain("'late_payment_success_already_refunded'");
        expect(lateSuccess).toContain("'alreadyFullyRefunded', v_payment_already_fully_refunded");

        expect(settlementProjection).toContain(
            "update commerce.payment_cancellation_requests set status = 'completed'",
        );
        expect(settlementProjection).toContain("status = v_payment_cancellation.target_order_status");
        expect(settlementProjection).toContain("update commerce.order_fulfillments set");
        expect(settlementProjection).toContain("'payment_window_expired_after_full_refund'");
        expect(settlementProjection).toContain("'order_cancelled_after_full_refund'");
        expect(settlementProjection).toContain("resolved_by = 'protected-refund'");
    });
}
