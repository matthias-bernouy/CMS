import type { JsonRecord } from "../shared/types.ts";
import { callRpcRows } from "./postgrest.ts";

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
