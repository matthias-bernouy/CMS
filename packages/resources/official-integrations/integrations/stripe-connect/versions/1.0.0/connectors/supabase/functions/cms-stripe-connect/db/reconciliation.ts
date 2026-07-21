import type { JsonRecord } from "../shared/types.ts";
import { callRpcObject, callRpcRows, rest, restError } from "./postgrest.ts";

export type ReconciliationOperationRead = {
    operation: JsonRecord;
    client_reference_id: string | null;
    payment_currency: string | null;
};

export type ReconciliationProjectionRead = {
    projection: JsonRecord;
    payment: JsonRecord | null;
    financial_operation: JsonRecord | null;
    operation_payment: JsonRecord | null;
    dispute: JsonRecord | null;
    dispute_client_reference_id: string | null;
    staged_evidence: JsonRecord | null;
    evidence_submission_count: number;
    pending_approval: JsonRecord | null;
};

export type PaymentReconciliationLedgerRead = {
    refunded_amount: number;
    transferred_amount: number;
    reversed_amount: number;
    seller_recovery_amount: number;
};

export async function readReconciliationOperations(
    limit: number,
): Promise<ReconciliationOperationRead[]> {
    return await callRpcRows<ReconciliationOperationRead>("read_reconciliation_operations", {
        p_limit: limit,
    });
}

export async function claimReconciliationProjectionBatch(
    owner: string,
    limit: number,
): Promise<ReconciliationProjectionRead[]> {
    return await callRpcRows<ReconciliationProjectionRead>("claim_reconciliation_projection_batch", {
        p_owner: owner,
        p_limit: limit,
    });
}

export async function readPaymentReconciliationLedger(
    paymentId: number,
): Promise<PaymentReconciliationLedgerRead> {
    return await callRpcObject<PaymentReconciliationLedgerRead>(
        "read_payment_reconciliation_ledger",
        { p_payment_id: paymentId },
    );
}

export async function resolveProviderExceptionRow(
    deduplicationKey: string,
    resolvedAt: string,
): Promise<void> {
    const query = new URLSearchParams();
    query.set("deduplication_key", `eq.${deduplicationKey}`);
    query.set("status", "neq.resolved");
    const response = await rest(`provider_exceptions?${query.toString()}`, {
        method: "PATCH",
        headers: {
            "content-type": "application/json",
            prefer: "return=minimal",
        },
        body: JSON.stringify({
            status: "resolved",
            resolved_at: resolvedAt,
            resolved_by: "provider-reconciliation",
        }),
    });
    if (!response.ok) throw await restError(response);
}
