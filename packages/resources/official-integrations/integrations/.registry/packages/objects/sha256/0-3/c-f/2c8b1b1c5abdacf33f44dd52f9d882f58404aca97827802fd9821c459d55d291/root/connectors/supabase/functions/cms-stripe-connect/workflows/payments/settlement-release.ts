import { insertRow, updateRow } from "../../db/postgrest.ts";
import { reserveFinancialOperation, updateFinancialOperation } from "../../db/repositories/financial-operations.ts";
import { readSettlementReleaseContext, readSettlementReleaseLedger } from "../../db/repositories/settlement-release.ts";
import { updatePayment } from "../../db/repositories/payments.ts";
import type { FinancialOperationRow } from "../../db/records/operations.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { transferSelect, type TransferRow } from "../../db/records/transfers.ts";
import { sellerCanReceivePayments } from "../../domain/accounts/eligibility.ts";
import { publicTransfer } from "../../domain/transfers/presentation.ts";
import { HttpError } from "../../http/errors.ts";
import { createStripeTransfer, retrieveStripeTransfer } from "../../provider/transfers.ts";
import type { StripeTransfer } from "../../provider/types.ts";
import { stableStripeIdempotencyKey } from "../../shared/crypto.ts";
import type { JsonRecord } from "../../shared/types.ts";
import {
    assertTransferReplay,
    findStripeTransfer,
    releasableDisputeStatus,
    type SettlementReleaseKind,
} from "./settlement-release-recovery.ts";

type SettlementReleaseDependencies = {
    reconcilePayment(payment: ConnectPaymentRow): Promise<ConnectPaymentRow>;
    moveOperationToManualReview(
        paymentId: number,
        operation: FinancialOperationRow,
        error: unknown,
        exceptionType: string,
    ): Promise<void>;
};

export type ExecuteSettlementRelease = (
    payment: ConnectPaymentRow,
    releaseAuthorizationId: string,
    releaseKind: SettlementReleaseKind,
    amount: number,
    currency: string,
) => Promise<JsonRecord>;

export function createSettlementReleaseWorkflow({
    reconcilePayment,
    moveOperationToManualReview,
}: SettlementReleaseDependencies): ExecuteSettlementRelease {
    return async function executeSettlementRelease(payment, releaseAuthorizationId, releaseKind, amount, currency) {
        // A release must verify current provider truth synchronously. Periodic
        // reconciliation and webhooks reduce latency, but neither is a safe gate
        // against a just-opened dispute or an out-of-band provider refund.
        payment = await reconcilePayment(payment);
        if (payment.payment_status !== "succeeded" || !payment.stripe_charge_id) {
            throw new HttpError(409, "payment is not confirmed by Stripe");
        }
        const releaseContext = await readSettlementReleaseContext(
            payment.id,
            payment.seller_cms_user_id,
            releaseAuthorizationId,
        );
        const seller = releaseContext.sellerAccount;
        if (!seller || !sellerCanReceivePayments(seller)) {
            throw new HttpError(409, "seller financial risk blocks settlement release");
        }
        if (currency !== payment.currency || currency !== "eur") {
            throw new HttpError(409, "release currency mismatch");
        }
        const existingTransfer = releaseContext.existingTransfer;
        if (existingTransfer) {
            assertTransferReplay(existingTransfer, payment, releaseKind, amount, currency);
            if (existingTransfer.status === "succeeded") {
                return publicTransfer(existingTransfer);
            }
        }
        if (!releasableDisputeStatus(payment.dispute_status)) {
            throw new HttpError(409, "payment is blocked by an open, lost, or unresolved Stripe dispute");
        }
        if (!["held", "eligible", "release_pending"].includes(payment.settlement_status)) {
            throw new HttpError(409, "payment settlement is blocked or requires finance review");
        }
        const authorizedSellerAmount = payment.seller_transfer_amount - releaseContext.sellerRecoveryAmount;
        const netTransferredAmount = payment.transferred_amount - payment.reversed_amount;
        if (amount <= 0 || netTransferredAmount + amount > authorizedSellerAmount) {
            throw new HttpError(409, "release exceeds the authorized seller transfer amount");
        }

        const businessKey = `settlement:${payment.id}:${releaseAuthorizationId}`;
        const operation = await reserveFinancialOperation(payment.id, {
            businessKey,
            operationType: "transfer_create",
            request: {
                releaseAuthorizationId,
                releaseKind,
                amount,
                currency,
                sourceChargeId: releaseKind === "recovery" ? null : payment.stripe_charge_id,
                destinationAccountId: payment.seller_stripe_account_id,
                transferGroup: payment.transfer_group,
            },
        });
        let transfer = existingTransfer;
        if (!transfer) {
            transfer = await insertRow<TransferRow>("transfers", transferSelect, {
                payment_id: payment.id,
                operation_id: operation.id,
                release_authorization_id: releaseAuthorizationId,
                release_kind: releaseKind,
                source_charge_id: releaseKind === "recovery" ? null : payment.stripe_charge_id,
                destination_account_id: payment.seller_stripe_account_id,
                transfer_group: payment.transfer_group,
                amount,
                currency,
                status: "reserved",
            });
        } else {
            assertTransferReplay(transfer, payment, releaseKind, amount, currency);
        }

        try {
            let stripeTransfer: StripeTransfer | null = null;
            if (operation.status === "succeeded" && operation.stripe_object_id) {
                stripeTransfer = await retrieveStripeTransfer(operation.stripe_object_id);
            } else if (operation.attempt_count > 0) {
                stripeTransfer = await findStripeTransfer(payment, releaseAuthorizationId, releaseKind, amount);
                if (!stripeTransfer && operation.status === "manual_review") {
                    throw new HttpError(409, "Transfer outcome is unresolved and requires finance review");
                }
            }
            if (!stripeTransfer) {
                await updateFinancialOperation(operation.id, {
                    status: "processing",
                    claimed_at: new Date().toISOString(),
                    attempt_count: operation.attempt_count + 1,
                });
                await updateRow("transfers", transfer.id, { status: "processing" });
                stripeTransfer = await createStripeTransfer(
                    payment,
                    releaseAuthorizationId,
                    releaseKind,
                    amount,
                    await stableStripeIdempotencyKey("transfer", businessKey),
                );
            }
            transfer =
                (await updateRow<TransferRow>(
                    "transfers",
                    transfer.id,
                    {
                        stripe_transfer_id: stripeTransfer.id,
                        status: "succeeded",
                        provider_snapshot: stripeTransfer,
                    },
                    transferSelect,
                )) ?? transfer;
            await updateFinancialOperation(operation.id, {
                status: "succeeded",
                stripe_object_id: stripeTransfer.id,
                response: stripeTransfer,
                completed_at: new Date().toISOString(),
            });
            const ledger = await readSettlementReleaseLedger(payment.id);
            const remainingAuthorizedSellerAmount = payment.seller_transfer_amount - ledger.sellerRecoveryAmount;
            await updatePayment(payment.id, {
                transferred_amount: ledger.transferredAmount,
                settlement_status:
                    ledger.transferredAmount - ledger.reversedAmount >= remainingAuthorizedSellerAmount
                        ? "released"
                        : "held",
            });
            return publicTransfer(transfer);
        } catch (error) {
            await moveOperationToManualReview(payment.id, operation, error, "transfer_create_ambiguous");
            throw error;
        }
    };
}
