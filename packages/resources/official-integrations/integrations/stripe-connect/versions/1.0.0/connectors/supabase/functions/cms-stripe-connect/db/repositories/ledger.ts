import type { JsonRecord } from "../../shared/types.ts";
import { listRows } from "../postgrest.ts";

export async function sumSucceededAmounts(table: string, paymentId: number): Promise<number> {
    const rows = await listRows<JsonRecord>(`${table}?payment_id=eq.${paymentId}&status=eq.succeeded&select=amount`);
    return rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

export async function sumSucceededField(table: string, paymentId: number, field: string): Promise<number> {
    const rows = await listRows<JsonRecord>(
        `${table}?payment_id=eq.${paymentId}&status=eq.succeeded&select=${encodeURIComponent(field)}`,
    );
    return rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
}

export async function sumSucceededTransferReversalAmounts(transferId: number): Promise<number> {
    const rows = await listRows<JsonRecord>(
        `transfer_reversals?transfer_id=eq.${transferId}&status=eq.succeeded&select=amount`,
    );
    return rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

export async function sumConfirmedRecoveryAmount(recoveryId: number): Promise<number> {
    const rows = await listRows<JsonRecord>(
        `transfer_reversals?recovery_id=eq.${recoveryId}&status=eq.succeeded&select=amount`,
    );
    return rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

export async function sumSucceededRefundSellerRecovery(paymentId: number): Promise<number> {
    const rows = await listRows<JsonRecord>(
        `refunds?payment_id=eq.${paymentId}&status=eq.succeeded&select=seller_entitlement_reduction_amount`,
    );
    return rows.reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0);
}
