import { same } from "../../../records";
import { OperationRecoveryFixtures } from "./operations";

export class SettlementRecoveryFixtures extends OperationRecoveryFixtures {
    seedNonterminalSettlementRelease(
        paymentId: number,
        releaseAuthorizationId: string,
    ): {
        operationId: number;
        transferId: number;
    } {
        const payment = this.tables.payments.find((row) => same(row.id, paymentId));
        if (!payment) {
            throw new Error(`unknown payment ${paymentId}`);
        }
        const operation = this.insertGeneric("financial_operations", {
            payment_id: paymentId,
            business_key: `settlement:${paymentId}:${releaseAuthorizationId}`,
            operation_type: "transfer_create",
            status: "failed",
            stripe_object_id: null,
            request: {
                releaseAuthorizationId,
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
                sourceChargeId: payment.stripe_charge_id,
                destinationAccountId: payment.seller_stripe_account_id,
                transferGroup: payment.transfer_group,
            },
            response: null,
            last_error: "simulated nonterminal Transfer operation",
            attempt_count: 1,
            next_attempt_at: null,
            claimed_at: null,
            completed_at: null,
        });
        const transfer = this.insertGeneric("transfers", {
            payment_id: paymentId,
            operation_id: operation.id,
            release_authorization_id: releaseAuthorizationId,
            release_kind: "initial",
            stripe_transfer_id: null,
            source_charge_id: payment.stripe_charge_id,
            destination_account_id: payment.seller_stripe_account_id,
            transfer_group: payment.transfer_group,
            amount: 1080,
            currency: "eur",
            status: "processing",
            provider_snapshot: null,
        });
        return { operationId: Number(operation.id), transferId: Number(transfer.id) };
    }
}
