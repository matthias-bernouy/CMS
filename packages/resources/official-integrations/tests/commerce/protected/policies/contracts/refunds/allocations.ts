import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { functionSql, integrationRoot } from "../paths";

export function registerRefundAllocationsTest(): void {
    test("derives generic refund allocations and enforces distinct dual approvers", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const createRefund = functionSql(schema, "create_refund_request", "refund_authorization_payload");
        const requestRefund = functionSql(schema, "request_order_refund", "review_refund_request");
        const reviewRefund = functionSql(schema, "review_refund_request", "authorize_order_release");
        const authorizeRelease = functionSql(schema, "authorize_order_release", "authorize_order_reserve_release");
        const reviewCancellationAs = functionSql(schema, "review_order_cancellation_as", "review_order_cancellation");
        const reviewCancellation = functionSql(schema, "review_order_cancellation", "process_due_order_deadlines");
        const deadlineWorker = functionSql(schema, "process_due_order_deadlines", "authorize_due_order_releases");
        const resolveClaim = functionSql(schema, "resolve_marketplace_claim", "request_order_refund");
        const recoverShipment = functionSql(schema, "recover_order_shipment_creation", "fail_order_shipment_creation");

        expect(requestRefund).not.toContain("p_seller_recovery_amount");
        expect(requestRefund).not.toContain("p_protection_fee_refund_amount");
        expect(requestRefund).toContain("commerce.calculate_protection_fee_refund");
        expect(requestRefund).toContain("v_terms.seller_proceeds_amount - v_existing_seller_recovery");
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
