import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import { SettlementRecoveryFixtures } from "./settlement";

export class ReconciliationPageFixtures extends SettlementRecoveryFixtures {
    seedTerminalReconciliationPage(runKey: string) {
        const createdAt = "2026-07-21T09:00:00.000Z";
        const updatedAt = "2026-07-21T09:05:00.000Z";
        const run = this.insertGeneric("reconciliation_runs", {
            run_key: runKey,
            status: "succeeded",
            scanned_count: 3,
            repaired_count: 2,
            exception_count: 0,
            details: { fixture: "terminal-provider-reconciliation" },
            started_at: createdAt,
            finished_at: updatedAt,
        });
        const paymentId = this.seedDashboardPayment("terminal-reconciliation-order", {
            stripe_payment_intent_id: "pi_terminal_reconciliation",
            stripe_charge_id: "ch_terminal_reconciliation",
            stripe_charge_balance_transaction_id: "txn_terminal_reconciliation",
            transferred_amount: 1080,
            actual_stripe_charge_fee_amount: 65,
            actual_stripe_processing_fee_amount: 65,
            actual_stripe_charge_net_amount: 1135,
            actual_stripe_fee_currency: "eur",
            actual_stripe_charge_fee_details: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
            settlement_status: "released",
            dispute_status: "open",
            description: "Terminal reconciliation fixture",
            paid_at: createdAt,
            last_provider_sync_at: updatedAt,
            created_at: createdAt,
            updated_at: updatedAt,
        });
        const operation = this.insertGeneric("financial_operations", {
            payment_id: paymentId,
            business_key: "transfer:terminal-reconciliation",
            operation_type: "transfer_create",
            status: "succeeded",
            stripe_object_id: "tr_terminal_reconciliation",
            request: {
                amount: 1080,
                currency: "eur",
                releaseAuthorizationId: "release-terminal-reconciliation",
            },
            response: { id: "tr_terminal_reconciliation", status: "succeeded" },
            last_error: null,
            attempt_count: 1,
            next_attempt_at: null,
            claimed_at: createdAt,
            completed_at: updatedAt,
            created_at: createdAt,
            updated_at: updatedAt,
        });
        const dispute = this.insertGeneric("stripe_disputes", {
            payment_id: paymentId,
            stripe_dispute_id: "dp_terminal_reconciliation",
            stripe_charge_id: "ch_terminal_reconciliation",
            amount: 1200,
            currency: "eur",
            reason: "fraudulent",
            status: "needs_response",
            evidence_status: "staged",
            evidence_due_by: "2026-07-28T09:00:00.000Z",
            is_charge_refundable: false,
            funds_withdrawn: true,
            last_funds_event_at: createdAt,
            last_funds_event_id: "evt_terminal_reconciliation",
            balance_transaction_ids: ["txn_dispute_terminal_reconciliation"],
            provider_snapshot: { id: "dp_terminal_reconciliation", status: "needs_response" },
            created_at: createdAt,
            updated_at: updatedAt,
        });
        this.insertGeneric("stripe_dispute_evidence", {
            dispute_id: dispute.id,
            evidence_operation_id: "evidence-terminal-reconciliation",
            staged_at: createdAt,
            submitted_at: updatedAt,
        });
        this.insertGeneric("irreversible_dispute_action_approvals", {
            dispute_id: dispute.id,
            action_type: "dispute_accept",
            status: "pending_second_approval",
            first_actor_id: "admin-first",
            first_approved_at: createdAt,
            second_actor_id: null,
            second_approved_at: null,
            created_at: createdAt,
        });
        const projection = (kind: string, key: string, values: JsonRecord) =>
            this.insertGeneric("commerce_projection_outbox", {
                operation_id: null,
                payment_id: paymentId,
                projection_key: key,
                projection_kind: kind,
                provider_object_id: null,
                projection_payload: {},
                recovery_key: null,
                projection_status: "pending",
                attempt_count: 0,
                next_attempt_at: null,
                claim_owner: null,
                claim_token: null,
                claimed_at: null,
                last_error: null,
                projected_at: null,
                intervention_revision: 0,
                ...values,
            });
        const paymentKey = "terminal:payment";
        const operationKey = "terminal:transfer";
        const disputeKey = "terminal:dispute";
        const paymentProjection = projection("payment", paymentKey, {
            provider_object_id: String(paymentId),
            causal_sequence: 10,
            created_at: "2026-07-21T09:10:00.000Z",
        });
        const operationProjection = projection("transfer", operationKey, {
            operation_id: operation.id,
            provider_object_id: "tr_terminal_reconciliation",
            causal_sequence: 20,
            created_at: "2026-07-21T09:11:00.000Z",
        });
        const disputeProjection = projection("dispute", disputeKey, {
            provider_object_id: String(dispute.id),
            causal_sequence: 30,
            created_at: "2026-07-21T09:12:00.000Z",
        });
        return {
            runId: Number(run.id),
            runKey,
            paymentId,
            operationId: Number(operation.id),
            disputeRowId: Number(dispute.id),
            paymentProjectionId: Number(paymentProjection.id),
            operationProjectionId: Number(operationProjection.id),
            disputeProjectionId: Number(disputeProjection.id),
            paymentProjectionKey: paymentKey,
            operationProjectionKey: operationKey,
            disputeProjectionKey: disputeKey,
        };
    }

    removeTerminalReconciliationDispute(disputeRowId: number): void {
        const index = this.tables.stripe_disputes.findIndex((row) => same(row.id, disputeRowId));
        if (index < 0) {
            throw new Error(`unknown terminal reconciliation dispute ${disputeRowId}`);
        }
        this.tables.stripe_disputes.splice(index, 1);
    }

    injectInFlightTransferBeforeNextRefundReservation(paymentId: number, amount: number): void {
        this.inFlightTransferBeforeRefund = { paymentId, amount };
    }
}
