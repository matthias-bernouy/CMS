import type { JsonRecord } from "../../shared/types.ts";

export type ConnectPaymentRow = {
    id: number;
    client_reference_id: string;
    financial_terms_hash: string;
    financial_revision: number;
    dual_approval_threshold_amount: number;
    buyer_cms_user_id: string;
    seller_cms_user_id: string;
    seller_stripe_account_id: string;
    stripe_payment_intent_id: string | null;
    stripe_charge_id: string | null;
    stripe_charge_balance_transaction_id: string | null;
    last_stripe_event_id: string | null;
    transfer_group: string;
    currency: string;
    amount_total: number;
    seller_transfer_amount: number;
    platform_retained_amount: number;
    refunded_amount: number;
    transferred_amount: number;
    reversed_amount: number;
    actual_stripe_charge_fee_amount: number;
    actual_stripe_refund_fee_amount: number;
    actual_stripe_processing_fee_amount: number;
    actual_stripe_charge_net_amount: number | null;
    actual_stripe_fee_currency: string | null;
    actual_stripe_charge_fee_details: JsonRecord[];
    payment_status: string;
    settlement_status: string;
    dispute_status: string;
    description: string | null;
    manual_review_reason: string | null;
    paid_at: string | null;
    cancelled_at: string | null;
    last_provider_sync_at: string | null;
    created_at: string;
    updated_at: string;
};

export const paymentSelect = [
    "id",
    "client_reference_id",
    "financial_terms_hash",
    "financial_revision",
    "dual_approval_threshold_amount",
    "buyer_cms_user_id",
    "seller_cms_user_id",
    "seller_stripe_account_id",
    "stripe_payment_intent_id",
    "stripe_charge_id",
    "stripe_charge_balance_transaction_id",
    "last_stripe_event_id",
    "transfer_group",
    "currency",
    "amount_total",
    "seller_transfer_amount",
    "platform_retained_amount",
    "refunded_amount",
    "transferred_amount",
    "reversed_amount",
    "actual_stripe_charge_fee_amount",
    "actual_stripe_refund_fee_amount",
    "actual_stripe_processing_fee_amount",
    "actual_stripe_charge_net_amount",
    "actual_stripe_fee_currency",
    "actual_stripe_charge_fee_details",
    "payment_status",
    "settlement_status",
    "dispute_status",
    "description",
    "manual_review_reason",
    "paid_at",
    "cancelled_at",
    "last_provider_sync_at",
    "created_at",
    "updated_at",
].join(",");
