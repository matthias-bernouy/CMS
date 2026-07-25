import { expect, test } from "bun:test";
import { functionSql, loadCommerceSchemaSql } from "../paths";

export function registerRefundAllocationsTest(): void {
    test("derives generic refund allocations and enforces distinct dual approvers", async () => {
        const schema = await loadCommerceSchemaSql();
        const createRefund = functionSql(schema, "create_refund_request", "refund_authorization_payload");
        const requestRefund = functionSql(schema, "request_order_refund", "review_refund_request");
        const reviewRefund = functionSql(schema, "review_refund_request", "authorize_order_release");
        const authorizeRelease = functionSql(schema, "authorize_order_release", "authorize_order_reserve_release");
        const reviewCancellationAs = functionSql(schema, "review_order_cancellation_as", "review_order_cancellation");
        const reviewCancellation = functionSql(schema, "review_order_cancellation", "process_due_order_deadlines");
        const deadlineWorker = functionSql(schema, "process_due_order_deadlines", "authorize_due_order_releases");
        const resolveClaim = functionSql(schema, "resolve_allocated_marketplace_claim", "resolve_marketplace_claim");
        const recoverShipment = functionSql(schema, "recover_order_shipment_creation", "fail_order_shipment_creation");

        expect(requestRefund).toContain("request_allocated_order_refund");
        expect(requestRefund).toContain("p_merchandise_refund_amount");
        expect(requestRefund).toContain("p_shipping_refund_amount");
        expect(requestRefund).toContain("p_protection_fee_refund_amount");
        expect(requestRefund).toContain("commerce.create_allocated_refund_request");
        expect(requestRefund).toContain("commerce.calculate_protection_fee_refund");
        expect(requestRefund).toContain("v_terms.seller_proceeds_amount - v_existing_seller_recovery");
        expect(schema).toContain("calculate_allocated_protection_fee_refund");
        expect(schema).toContain("v_terms.merchandise_subtotal_amount");
        expect(schema).toContain("a legacy refund allocation requires manual reconciliation");
        expect(schema).toContain("merchandise_refund_amount bigint not null default 0");
        expect(schema).toContain("shipping_refund_amount bigint not null default 0");
        expect(schema).toContain("allocation_version smallint not null default 0");
        expect(schema).toContain("merchandise_refund_amount + shipping_refund_amount");
        expect(schema).toContain("'merchandiseRefundAmount', p_merchandise_refund_amount");
        expect(schema).toContain("'shippingRefundAmount', p_shipping_refund_amount");
        expect(resolveClaim).toContain("commerce.create_allocated_refund_request");
        expect(resolveClaim).toContain("p_merchandise_refund_amount");
        expect(resolveClaim).toContain("p_shipping_refund_amount");
        expect(resolveClaim).toContain("claim allocation does not match the seller transfer decision");
        expect(resolveClaim).toContain("v_claim.resolution_outcome is not distinct from p_outcome");
        expect(resolveClaim).toContain("v_claim.version is distinct from p_expected_version");
        expect(resolveClaim).toContain("where id = v_claim.id and version = p_expected_version");
        expect(resolveClaim).toContain("version = version + 1");
        expect(resolveClaim).toContain("claim refund did not transition the settlement");
        expect(schema).toContain("where id = v_refund.claim_id and status = 'resolution_pending'");
        expect(schema).toContain(
            "status = case resolution_outcome when 'buyer' then 'resolved_buyer' else 'resolved_split' end",
        );
        expect(schema).toContain("refund_requests_one_nonterminal_order_idx");
        expect(schema).toContain("v_cumulative_amount >= v_protection.finance_review_threshold_amount");
        expect(schema).toContain("v_cumulative_amount >= v_protection.dual_approval_threshold_amount");
        expect(createRefund).toContain("p_requested_by_kind is null");
        expect(createRefund).toContain("p_requested_by_kind not in ('buyer', 'seller', 'admin', 'system')");
        expect(createRefund).toContain("p_requested_by_kind = 'admin'");
        expect(requestRefund).toContain("if p_actor_kind is distinct from 'admin'");
        expect(resolveClaim).toContain("if p_actor_kind is distinct from 'admin'");
        expect(recoverShipment).toContain("p_actor_kind is distinct from 'admin'");
        expect(authorizeRelease).toContain("p_actor_kind is null or p_actor_kind not in ('admin', 'system')");
        expect(reviewCancellationAs).toContain("'order_cancellation', p_actor_kind, p_actor_id");
        expect(reviewCancellation).toContain("p_request_id, p_decision, 'admin', p_actor_id, p_reason");
        expect(deadlineWorker).toContain("v_candidate.id, 'approved', 'system', 'deadline-worker:'");
        expect(schema).toContain("actor_kind in ('buyer', 'seller', 'support', 'finance', 'admin', 'system')");
        expect(schema).toContain("requested_by_kind in ('buyer', 'seller', 'support', 'finance', 'admin', 'system')");
        expect(schema).toContain(
            "actor_kind in ('buyer', 'seller', 'support', 'finance', 'admin', 'system', 'provider')",
        );
        expect(schema).toContain("authorized_by_kind in ('finance', 'admin', 'system')");
        expect(reviewRefund).toContain("dual approval requires a second admin actor");
        expect(reviewRefund).toContain("'admin', p_actor_id");
        expect(reviewRefund).toContain("first_approved_by = p_actor_id");
        expect(reviewRefund).toContain("second_approved_by");
    });
}
