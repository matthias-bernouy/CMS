import type { TransferRecoveryRow, TransferRow } from "../../db/records/transfers.ts";
import type { JsonRecord } from "../../shared/types.ts";

export function publicTransfer(row: TransferRow): JsonRecord {
    return {
        transferId: row.id,
        providerOperationId: row.operation_id,
        paymentId: row.payment_id,
        releaseAuthorizationId: row.release_authorization_id,
        releaseKind: row.release_kind,
        stripeTransferId: row.stripe_transfer_id,
        sourceChargeId: row.source_charge_id,
        destinationAccountId: row.destination_account_id,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        occurredAt: row.updated_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function publicReversal(row: JsonRecord): JsonRecord {
    return {
        reversalId: row.id,
        providerOperationId: row.operation_id,
        paymentId: row.payment_id,
        reversalRequestId: row.reversal_request_id,
        stripeTransferReversalId: row.stripe_transfer_reversal_id,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        occurredAt: row.updated_at,
        providerSnapshot: row.provider_snapshot ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function publicTransferRecovery(recovery: TransferRecoveryRow, reversals: JsonRecord[]): JsonRecord {
    return {
        recoveryId: recovery.id,
        paymentId: recovery.payment_id,
        recoveryRequestId: recovery.recovery_request_id,
        exposureType: recovery.exposure_type,
        requestedAmount: recovery.requested_amount,
        allocatedAmount: recovery.allocated_amount,
        confirmedAmount: recovery.confirmed_amount,
        allocationShortfallAmount: recovery.allocation_shortfall_amount,
        currency: recovery.currency,
        reason: recovery.reason,
        allocationStrategy: recovery.allocation_strategy,
        status: recovery.status,
        lastError: recovery.last_error,
        reversals,
        createdAt: recovery.created_at,
        updatedAt: recovery.updated_at,
    };
}
