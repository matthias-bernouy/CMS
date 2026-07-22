import type { JsonRecord } from "../../../types";
import { ProviderPaymentFixtures } from "./payments";

export class ProviderMoneyFixtures extends ProviderPaymentFixtures {
    setProviderPayout(payout: JsonRecord): void {
        this.providerPayouts.set(String(payout.id), payout);
    }

    setNextRefundStatus(status: "succeeded" | "pending" | "failed"): void {
        this.nextRefundStatus = status;
    }

    setNextRefundFee(amount: number): void {
        this.nextRefundFee = amount;
    }

    loseNextRefundCreationResponse(): void {
        this.loseNextRefundResponse = true;
    }

    setNextRefundSearchScenario(scenario: ProtectedRefundSearchScenario): void {
        this.nextRefundSearchScenario = scenario;
    }

    succeedNextRefundOperation(): void {
        this.nextRefundOperationSucceeded = true;
    }

    updateProviderRefund(refundId: string, patch: JsonRecord): void {
        const refund = this.providerRefunds.find((candidate) => candidate.id === refundId);
        if (!refund) {
            throw new Error(`unknown provider refund ${refundId}`);
        }
        Object.assign(refund, patch);
        if (patch.status === "succeeded" && !refund.balance_transaction) {
            const amount = Number(refund.amount);
            refund.balance_transaction = {
                id: `txn_refund_${refundId.replace(/[^a-z0-9]/gi, "_")}`,
                amount: -amount,
                fee: 0,
                net: -amount,
                currency: refund.currency,
                fee_details: [],
            };
        }
    }
    setStripeAccountState(userId: string, patch: JsonRecord): void {
        this.stripeAccountState.set(userId, patch);
    }

    setAccountState(userId: string, patch: JsonRecord): void {
        const account = this.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account) {
            throw new Error(`unknown account ${userId}`);
        }
        this.update(account, patch);
    }

    addProviderDispute(chargeId: string, patch: JsonRecord = {}): void {
        this.providerDisputes.push({
            id: `dp_${this.providerDisputes.length + 1}`,
            charge: chargeId,
            amount: 1200,
            currency: "eur",
            reason: "fraudulent",
            status: "needs_response",
            evidence_details: { due_by: 1_800_000_000, submission_count: 0 },
            balance_transactions: [],
            ...patch,
        });
    }

    updateProviderDispute(disputeId: string, patch: JsonRecord): void {
        const dispute = this.providerDisputes.find((candidate) => candidate.id === disputeId);
        if (!dispute) {
            throw new Error(`unknown provider dispute ${disputeId}`);
        }
        Object.assign(dispute, patch);
    }

    addProviderRefund(chargeId: string, patch: JsonRecord = {}): void {
        this.providerRefunds.push({
            id: `re_external_${this.providerRefunds.length + 1}`,
            charge: chargeId,
            amount: 1200,
            currency: "eur",
            status: "succeeded",
            ...patch,
        });
    }

    patchProviderTransfer(stripeTransferId: string, patch: JsonRecord): void {
        const transfer = this.providerTransfers.find((candidate) => candidate.id === stripeTransferId);
        if (!transfer) {
            throw new Error(`unknown provider transfer ${stripeTransferId}`);
        }
        Object.assign(transfer, patch);
    }

    addProviderTransfer(transferGroup: string, patch: JsonRecord = {}): string {
        const id = `tr_external_${this.providerTransfers.length + 1}`;
        this.providerTransfers.push({
            id,
            amount: 1080,
            currency: "eur",
            destination: "acct_external_transfer",
            source_transaction: "ch_external_transfer",
            transfer_group: transferGroup,
            metadata: {},
            amount_reversed: 0,
            reversed: false,
            ...patch,
        });
        return id;
    }

    seedLocalTransferReversal(stripeTransferId: string, amount: number, status: string): void {
        const transfer = this.tables.transfers.find((row) => row.stripe_transfer_id === stripeTransferId);
        if (!transfer) {
            throw new Error(`unknown local transfer ${stripeTransferId}`);
        }
        const operation = this.insertGeneric("financial_operations", {
            payment_id: transfer.payment_id,
            business_key: `seed-transfer-reversal:${stripeTransferId}:${status}:${amount}`,
            operation_type: "transfer_reversal_create",
            status,
            request: {},
            response: null,
        });
        this.insertGeneric("transfer_reversals", {
            payment_id: transfer.payment_id,
            transfer_id: transfer.id,
            operation_id: operation.id,
            reversal_request_id: `seed-transfer-reversal:${operation.id}`,
            amount,
            currency: "eur",
            status,
        });
    }

    clearProviderRefunds(): void {
        this.providerRefunds.length = 0;
    }
}
