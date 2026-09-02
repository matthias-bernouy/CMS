import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import type { TransferRow } from "../../db/records/transfers.ts";
import { HttpError } from "../../http/errors.ts";
import { listStripeTransfersByGroup } from "../../provider/transfers.ts";
import type { StripeTransfer } from "../../provider/types.ts";
import { objectAt, recordArrayAt, stringAt, stripeObjectId } from "../../shared/data.ts";

export type SettlementReleaseKind = "initial" | "reserve" | "recovery";

export async function findStripeTransfer(
    payment: ConnectPaymentRow,
    releaseAuthorizationId: string,
    releaseKind: SettlementReleaseKind,
    amount: number,
): Promise<StripeTransfer | null> {
    const list = await listStripeTransfersByGroup(payment.transfer_group);
    const matches = recordArrayAt(list, "data").filter(
        (transfer) =>
            Number(transfer.amount) === amount &&
            stringAt(transfer, "currency") === payment.currency &&
            stripeObjectId(transfer.destination) === payment.seller_stripe_account_id &&
            stringAt(objectAt(transfer, "metadata"), "cms_payment_id") === String(payment.id) &&
            stringAt(objectAt(transfer, "metadata"), "cms_release_authorization_id") === releaseAuthorizationId &&
            stringAt(objectAt(transfer, "metadata"), "cms_release_kind") === releaseKind &&
            (releaseKind === "recovery"
                ? !stripeObjectId(transfer.source_transaction)
                : stripeObjectId(transfer.source_transaction) === payment.stripe_charge_id),
    );
    if (matches.length > 1 || (matches.length === 0 && list.has_more === true)) {
        throw new HttpError(409, "Stripe Transfer search is ambiguous");
    }
    return (matches[0] as StripeTransfer | undefined) ?? null;
}

export function assertTransferReplay(
    transfer: TransferRow,
    payment: ConnectPaymentRow,
    releaseKind: SettlementReleaseKind,
    amount: number,
    currency: string,
): void {
    if (
        transfer.payment_id !== payment.id ||
        transfer.amount !== amount ||
        transfer.currency !== currency ||
        transfer.release_kind !== releaseKind ||
        transfer.source_charge_id !== (releaseKind === "recovery" ? null : payment.stripe_charge_id) ||
        transfer.destination_account_id !== payment.seller_stripe_account_id
    ) {
        throw new HttpError(409, "settlement release replay mismatch");
    }
}

export function releasableDisputeStatus(status: string): boolean {
    return ["none", "won", "prevented", "warning_closed"].includes(status);
}
