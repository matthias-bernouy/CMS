import { asRecord, same } from "../../records";
import type { JsonRecord } from "../../types";
import { PaymentProjectionRecoveryPersistence } from "./projection-recovery";

export class RowPersistence extends PaymentProjectionRecoveryPersistence {
    insertGeneric(table: string, value: JsonRecord): JsonRecord {
        const now = "2026-07-06T12:05:00.000Z";
        const defaults =
            table === "refunds"
                ? {
                      stripe_refund_id: null,
                      stripe_balance_transaction_id: null,
                      failure_reason: null,
                      actual_stripe_fee_amount: 0,
                      actual_stripe_net_amount: null,
                      actual_stripe_fee_currency: null,
                      actual_stripe_fee_details: [],
                      provider_snapshot: null,
                  }
                : table === "stripe_dispute_evidence"
                  ? { staged_at: now, submitted_operation_id: null, submitted_at: null }
                  : {};
        const row = { id: this.nextRowId++, created_at: now, updated_at: now, ...defaults, ...value };
        this.tables[table].push(row);
        return { ...row };
    }

    update(row: JsonRecord, patch: JsonRecord): JsonRecord {
        Object.assign(row, patch, { updated_at: "2026-07-06T12:10:00.000Z" });
        return { ...row };
    }

    enqueueCommerceProjection(operation: JsonRecord): void {
        if (
            operation.status !== "succeeded" ||
            !operation.payment_id ||
            !["transfer_create", "transfer_reversal_create"].includes(String(operation.operation_type)) ||
            this.tables.commerce_projection_outbox.some((row) => same(row.operation_id, operation.id))
        ) {
            return;
        }
        const request = asRecord(operation.request);
        const kind = operation.operation_type === "transfer_create" ? "transfer" : "reversal";
        const recoveryKey = kind === "reversal" ? request.recoveryRequestId : null;
        this.insertGeneric("commerce_projection_outbox", {
            operation_id: operation.id,
            payment_id: operation.payment_id,
            projection_key: `operation:${operation.id}`,
            projection_kind: kind,
            provider_object_id: null,
            projection_payload: {},
            recovery_key: recoveryKey,
            causal_sequence: kind === "reversal" ? Number(request.allocationIndex ?? 0) : 0,
            projection_status: "pending",
            attempt_count: 0,
            next_attempt_at: null,
            claim_owner: null,
            claim_token: null,
            claimed_at: null,
            last_error: null,
            projected_at: null,
            intervention_revision: 0,
            last_intervention_at: null,
            last_intervention_by: null,
            last_intervention_reason: null,
        });
    }
}
