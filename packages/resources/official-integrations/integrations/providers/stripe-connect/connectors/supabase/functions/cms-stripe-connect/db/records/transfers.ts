import type { FinancialOperationRow } from "./operations.ts";
import type { JsonRecord } from "../../shared/types.ts";

export type TransferRow = {
    id: number;
    payment_id: number;
    operation_id: number;
    release_authorization_id: string;
    release_kind: "initial" | "reserve" | "recovery";
    stripe_transfer_id: string | null;
    source_charge_id: string | null;
    destination_account_id: string;
    transfer_group: string;
    amount: number;
    currency: string;
    status: string;
    provider_snapshot: JsonRecord | null;
    created_at: string;
    updated_at: string;
};

export type TransferRecoveryRow = {
    id: number;
    payment_id: number;
    recovery_request_id: string;
    exposure_type: "chargeback" | "refund_recovery" | "manual";
    requested_amount: number;
    allocated_amount: number;
    confirmed_amount: number;
    allocation_shortfall_amount: number;
    currency: string;
    reason: string | null;
    allocation_strategy: "newest_first";
    status: string;
    last_error: string | null;
    created_at: string;
    updated_at: string;
};

export type TransferReversalRow = {
    id: number;
    payment_id: number;
    recovery_id: number | null;
    allocation_index: number | null;
    transfer_id: number;
    operation_id: number;
    reversal_request_id: string;
    stripe_transfer_reversal_id: string | null;
    amount: number;
    currency: string;
    reason: string | null;
    status: string;
    provider_snapshot: JsonRecord | null;
    created_at: string;
    updated_at: string;
};

export type ReservedTransferRecovery = {
    recovery: TransferRecoveryRow;
    allocations: Array<{
        reversal: TransferReversalRow;
        operation: FinancialOperationRow;
        transfer: TransferRow;
    }>;
};

export const transferSelect = [
    "id",
    "payment_id",
    "operation_id",
    "release_authorization_id",
    "release_kind",
    "stripe_transfer_id",
    "source_charge_id",
    "destination_account_id",
    "transfer_group",
    "amount",
    "currency",
    "status",
    "provider_snapshot",
    "created_at",
    "updated_at",
].join(",");

export const transferRecoverySelect = [
    "id",
    "payment_id",
    "recovery_request_id",
    "exposure_type",
    "requested_amount",
    "allocated_amount",
    "confirmed_amount",
    "allocation_shortfall_amount",
    "currency",
    "reason",
    "allocation_strategy",
    "status",
    "last_error",
    "created_at",
    "updated_at",
].join(",");

export const transferReversalSelect = [
    "id",
    "payment_id",
    "recovery_id",
    "allocation_index",
    "transfer_id",
    "operation_id",
    "reversal_request_id",
    "stripe_transfer_reversal_id",
    "amount",
    "currency",
    "reason",
    "status",
    "provider_snapshot",
    "created_at",
    "updated_at",
].join(",");
