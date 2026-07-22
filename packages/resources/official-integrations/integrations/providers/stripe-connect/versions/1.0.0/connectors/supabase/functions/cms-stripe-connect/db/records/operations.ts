import type { JsonRecord } from "../../shared/types.ts";

export type FinancialOperationRow = {
    id: number;
    payment_id: number | null;
    business_key: string;
    operation_type: string;
    status: string;
    stripe_object_id: string | null;
    request: JsonRecord;
    response: JsonRecord | null;
    last_error: string | null;
    attempt_count: number;
    next_attempt_at: string | null;
    claimed_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
};

export type PlatformPayoutControlRow = {
    control_key: "default";
    liability_revision: number;
    required_minimum_amount: number;
    provider_minimum_amount: number;
    decrease_authorization_id: string | null;
    claim_owner: string | null;
    claimed_at: string | null;
    last_error: string | null;
    last_provider_sync_at: string | null;
};

export type CommerceProjectionOutboxRow = {
    id: number;
    operation_id: number | null;
    payment_id: number;
    projection_key: string;
    projection_kind: "payment" | "transfer" | "reversal" | "refund" | "dispute";
    provider_object_id: string | null;
    projection_payload: JsonRecord;
    recovery_key: string | null;
    causal_sequence: number;
    projection_status: string;
    attempt_count: number;
    next_attempt_at: string | null;
    claim_owner: string | null;
    claim_token: string | null;
    claimed_at: string | null;
    last_error: string | null;
    projected_at: string | null;
    intervention_revision: number;
    last_intervention_at: string | null;
    last_intervention_by: string | null;
    last_intervention_reason: string | null;
    created_at: string;
    updated_at: string;
};

export const operationSelect = [
    "id",
    "payment_id",
    "business_key",
    "operation_type",
    "status",
    "stripe_object_id",
    "request",
    "response",
    "last_error",
    "attempt_count",
    "next_attempt_at",
    "claimed_at",
    "completed_at",
    "created_at",
    "updated_at",
].join(",");
