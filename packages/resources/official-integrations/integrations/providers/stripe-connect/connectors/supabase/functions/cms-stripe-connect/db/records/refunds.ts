import type { JsonRecord } from "../../shared/types.ts";

export type RefundRow = {
    id: number;
    payment_id: number;
    operation_id: number;
    refund_request_id: string;
    commerce_refund_request_id: number | null;
    stripe_refund_id: string | null;
    stripe_balance_transaction_id: string | null;
    stripe_charge_id: string;
    amount: number;
    required_reversal_amount: number;
    seller_entitlement_reduction_amount: number;
    authorized_seller_amount_after_refund: number;
    currency: string;
    reason: string | null;
    status: string;
    failure_reason: string | null;
    actual_stripe_fee_amount: number;
    actual_stripe_net_amount: number | null;
    actual_stripe_fee_currency: string | null;
    actual_stripe_fee_details: JsonRecord[];
    provider_snapshot: JsonRecord | null;
    created_at: string;
    updated_at: string;
};

export const refundSelect = [
    "id",
    "payment_id",
    "operation_id",
    "refund_request_id",
    "commerce_refund_request_id",
    "stripe_refund_id",
    "stripe_charge_id",
    "stripe_balance_transaction_id",
    "amount",
    "required_reversal_amount",
    "currency",
    "reason",
    "seller_entitlement_reduction_amount",
    "authorized_seller_amount_after_refund",
    "status",
    "failure_reason",
    "actual_stripe_fee_amount",
    "actual_stripe_net_amount",
    "actual_stripe_fee_currency",
    "actual_stripe_fee_details",
    "provider_snapshot",
    "created_at",
    "updated_at",
].join(",");
