import { HttpError } from "../../http/errors.ts";
import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { callRpcObject } from "../postgrest.ts";
import type { ConnectAccountRow } from "../records/accounts.ts";
import type { TransferRow } from "../records/transfers.ts";

export type SettlementReleaseContext = {
    sellerAccount: ConnectAccountRow | null;
    existingTransfer: TransferRow | null;
    sellerRecoveryAmount: number;
};

export type SettlementReleaseLedger = {
    transferredAmount: number;
    reversedAmount: number;
    sellerRecoveryAmount: number;
};

export async function readSettlementReleaseContext(
    paymentId: number,
    sellerCmsUserId: string,
    releaseAuthorizationId: string,
): Promise<SettlementReleaseContext> {
    const value = await callRpcObject<unknown>("read_settlement_release_context", {
        p_payment_id: paymentId,
        p_seller_cms_user_id: sellerCmsUserId,
        p_release_authorization_id: releaseAuthorizationId,
    });
    if (!isRecord(value)) {
        throw invalidSettlementRead("context");
    }
    const sellerAccount = nullableRecord(value.seller_account, "context");
    const existingTransfer = nullableRecord(value.existing_transfer, "context");
    if (sellerAccount && !isSettlementSeller(sellerAccount)) {
        throw invalidSettlementRead("context");
    }
    if (existingTransfer && !isSettlementTransfer(existingTransfer)) {
        throw invalidSettlementRead("context");
    }
    return {
        sellerAccount: sellerAccount as unknown as ConnectAccountRow | null,
        existingTransfer: existingTransfer as unknown as TransferRow | null,
        sellerRecoveryAmount: amountAt(value, "seller_recovery_amount", "context"),
    };
}

export async function readSettlementReleaseLedger(paymentId: number): Promise<SettlementReleaseLedger> {
    const value = await callRpcObject<unknown>("read_settlement_release_ledger", {
        p_payment_id: paymentId,
    });
    if (!isRecord(value)) {
        throw invalidSettlementRead("ledger");
    }
    return {
        transferredAmount: amountAt(value, "transferred_amount", "ledger"),
        reversedAmount: amountAt(value, "reversed_amount", "ledger"),
        sellerRecoveryAmount: amountAt(value, "seller_recovery_amount", "ledger"),
    };
}

function nullableRecord(value: unknown, source: string): JsonRecord | null {
    if (value === null) {
        return null;
    }
    if (!isRecord(value)) {
        throw invalidSettlementRead(source);
    }
    return value;
}

function amountAt(value: JsonRecord, key: string, source: string): number {
    const amount = value[key];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
        throw invalidSettlementRead(source);
    }
    return amount;
}

function isSettlementSeller(value: JsonRecord): boolean {
    return (
        typeof value.cms_user_id === "string" &&
        (value.stripe_account_id === null || typeof value.stripe_account_id === "string") &&
        typeof value.stripe_account_api_version === "string" &&
        typeof value.application_controlled_recipient === "boolean" &&
        typeof value.terms_accepted === "boolean" &&
        typeof value.provider_account_closed === "boolean" &&
        (value.marketplace_terms_accepted_at === null || typeof value.marketplace_terms_accepted_at === "string") &&
        typeof value.onboarding_status === "string" &&
        typeof value.details_submitted === "boolean" &&
        isRecord(value.capabilities) &&
        Array.isArray(value.requirements_currently_due) &&
        Array.isArray(value.requirements_past_due) &&
        Array.isArray(value.requirements_pending_verification) &&
        typeof value.risk_status === "string" &&
        typeof value.outstanding_debt_amount === "number" &&
        typeof value.financial_exposure_amount === "number" &&
        (value.financial_hold_reason === null || typeof value.financial_hold_reason === "string") &&
        (value.manual_payout_hold_started_at === null || typeof value.manual_payout_hold_started_at === "string")
    );
}

function isSettlementTransfer(value: JsonRecord): boolean {
    return (
        typeof value.id === "number" &&
        typeof value.payment_id === "number" &&
        typeof value.operation_id === "number" &&
        typeof value.release_authorization_id === "string" &&
        typeof value.release_kind === "string" &&
        (value.stripe_transfer_id == null || typeof value.stripe_transfer_id === "string") &&
        (value.source_charge_id == null || typeof value.source_charge_id === "string") &&
        typeof value.destination_account_id === "string" &&
        typeof value.transfer_group === "string" &&
        typeof value.amount === "number" &&
        typeof value.currency === "string" &&
        typeof value.status === "string" &&
        typeof value.created_at === "string" &&
        typeof value.updated_at === "string"
    );
}

function invalidSettlementRead(source: string): HttpError {
    return new HttpError(502, `settlement release ${source} returned an invalid response`);
}
