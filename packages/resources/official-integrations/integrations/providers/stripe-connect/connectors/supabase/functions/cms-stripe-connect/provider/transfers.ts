import type { ConnectPaymentRow } from "../db/records/payments.ts";
import type { JsonRecord } from "../shared/types.ts";
import { stripeV1 } from "./stripe-client.ts";
import type { StripeTransfer } from "./types.ts";

export async function createStripeTransfer(
    payment: ConnectPaymentRow,
    releaseAuthorizationId: string,
    releaseKind: "initial" | "reserve" | "recovery",
    amount: number,
    idempotencyKey: string,
): Promise<StripeTransfer> {
    const params = new URLSearchParams();
    params.set("amount", String(amount));
    params.set("currency", payment.currency);
    params.set("destination", payment.seller_stripe_account_id);
    if (releaseKind !== "recovery") {
        params.set("source_transaction", payment.stripe_charge_id!);
    }
    params.set("transfer_group", payment.transfer_group);
    params.set("metadata[cms_payment_id]", String(payment.id));
    params.set("metadata[cms_release_authorization_id]", releaseAuthorizationId);
    params.set("metadata[cms_release_kind]", releaseKind);
    params.set("metadata[financial_terms_hash]", payment.financial_terms_hash);
    return await stripeV1<StripeTransfer>(
        "/transfers",
        {
            method: "POST",
            body: params,
        },
        { idempotencyKey },
    );
}

export async function retrieveStripeTransfer(transferId: string): Promise<StripeTransfer> {
    return await stripeV1<StripeTransfer>(`/transfers/${encodeURIComponent(transferId)}`, { method: "GET" });
}

export async function listStripeTransfersByGroup(transferGroup: string): Promise<JsonRecord> {
    const params = new URLSearchParams({ transfer_group: transferGroup, limit: "100" });
    return await stripeV1<JsonRecord>(`/transfers?${params.toString()}`, { method: "GET" });
}

export async function createStripeTransferReversal(
    transferId: string,
    amount: number,
    operationKey: string,
    idempotencyKey: string,
): Promise<JsonRecord> {
    const params = new URLSearchParams();
    params.set("amount", String(amount));
    params.set("metadata[operation_key]", operationKey);
    return await stripeV1<JsonRecord>(
        `/transfers/${encodeURIComponent(transferId)}/reversals`,
        {
            method: "POST",
            body: params,
        },
        { idempotencyKey },
    );
}

export async function retrieveStripeTransferReversal(transferId: string, reversalId: string): Promise<JsonRecord> {
    return await stripeV1<JsonRecord>(
        `/transfers/${encodeURIComponent(transferId)}/reversals/${encodeURIComponent(reversalId)}`,
        { method: "GET" },
    );
}

export async function listStripeTransferReversals(transferId: string): Promise<JsonRecord> {
    return await stripeV1<JsonRecord>(`/transfers/${encodeURIComponent(transferId)}/reversals?limit=100`, {
        method: "GET",
    });
}
