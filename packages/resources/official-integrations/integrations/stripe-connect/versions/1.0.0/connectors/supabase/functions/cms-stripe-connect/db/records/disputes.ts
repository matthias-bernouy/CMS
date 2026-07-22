import type { JsonRecord } from "../../shared/types.ts";

export type StripeDisputeRow = {
    id: number;
    payment_id: number;
    stripe_dispute_id: string;
    stripe_charge_id: string;
    amount: number;
    currency: string;
    reason: string | null;
    status: string;
    evidence_status: string;
    evidence_due_by: string | null;
    is_charge_refundable: boolean | null;
    funds_withdrawn: boolean;
    last_funds_event_at: string | null;
    last_funds_event_id: string | null;
    balance_transaction_ids: string[];
    provider_snapshot: JsonRecord;
    created_at: string;
    updated_at: string;
};

export const disputeSelect = [
    "id",
    "payment_id",
    "stripe_dispute_id",
    "stripe_charge_id",
    "amount",
    "currency",
    "reason",
    "status",
    "evidence_status",
    "evidence_due_by",
    "is_charge_refundable",
    "funds_withdrawn",
    "last_funds_event_at",
    "last_funds_event_id",
    "balance_transaction_ids",
    "provider_snapshot",
    "created_at",
    "updated_at",
].join(",");
