import type { OperationRecoveryKind, TerminalOperationRecoverySeed } from "../../../../provider-reconciliation/harness";
import type { JsonRecord } from "../../../types";
import { FailureControls } from "../failures";

export class OperationRecoveryFixtures extends FailureControls {
    seedTerminalOperationRecovery(kind: OperationRecoveryKind): TerminalOperationRecoverySeed {
        const paymentId = this.seedDashboardPayment(`terminal-${kind}-recovery`, {
            stripe_charge_id: "ch_terminal_operation_recovery",
            transferred_amount: kind === "refund" ? 0 : 1080,
            settlement_status: kind === "refund" ? "refund_pending" : "released",
        });
        const request =
            kind === "transfer"
                ? {
                      releaseAuthorizationId: "release-terminal-operation-recovery",
                      releaseKind: "initial",
                      amount: 1080,
                      currency: "eur",
                  }
                : kind === "reversal"
                  ? {
                        recoveryRequestId: "recovery-terminal-operation-recovery",
                        reversalRequestId: "reversal-terminal-operation-recovery",
                        transferId: "tr_terminal_operation_recovery",
                        amount: 1080,
                        currency: "eur",
                        allocationIndex: 1,
                    }
                  : {
                        refundRequestId: "refund-terminal-operation-recovery",
                        commerceRefundRequestId: 701,
                        amount: 1200,
                        requiredReversalAmount: 0,
                        sellerEntitlementReductionAmount: 0,
                        authorizedSellerAmount: 1080,
                        currency: "eur",
                    };
        const operation = this.insertGeneric("financial_operations", {
            payment_id: paymentId,
            business_key: `${kind}:terminal-operation-recovery`,
            operation_type:
                kind === "transfer"
                    ? "transfer_create"
                    : kind === "reversal"
                      ? "transfer_reversal_create"
                      : "refund_create",
            status: "failed",
            stripe_object_id: null,
            request,
            response: null,
            last_error: "simulated lost local completion response",
            attempt_count: 1,
            next_attempt_at: null,
            claimed_at: null,
            completed_at: null,
        });
        let artifact: JsonRecord;
        let providerObjectId: string;
        if (kind === "transfer") {
            providerObjectId = "tr_terminal_operation_recovery";
            artifact = this.insertGeneric("transfers", {
                payment_id: paymentId,
                operation_id: operation.id,
                release_authorization_id: "release-terminal-operation-recovery",
                release_kind: "initial",
                stripe_transfer_id: providerObjectId,
                source_charge_id: "ch_terminal_operation_recovery",
                destination_account_id: `acct_terminal-${kind}-recovery`,
                transfer_group: `group_terminal-${kind}-recovery`,
                amount: 1080,
                currency: "eur",
                status: "succeeded",
                provider_snapshot: { id: providerObjectId, status: "succeeded" },
            });
        } else if (kind === "reversal") {
            const parentOperation = this.insertGeneric("financial_operations", {
                payment_id: paymentId,
                business_key: "transfer:terminal-operation-recovery-parent",
                operation_type: "transfer_create",
                status: "succeeded",
                request: {},
                response: {},
            });
            const transfer = this.insertGeneric("transfers", {
                payment_id: paymentId,
                operation_id: parentOperation.id,
                release_authorization_id: "release-terminal-operation-recovery-parent",
                release_kind: "initial",
                stripe_transfer_id: "tr_terminal_operation_recovery",
                source_charge_id: "ch_terminal_operation_recovery",
                destination_account_id: "acct_terminal-reversal-recovery",
                transfer_group: "group_terminal-reversal-recovery",
                amount: 1080,
                currency: "eur",
                status: "reversed",
                provider_snapshot: { id: "tr_terminal_operation_recovery" },
            });
            providerObjectId = "trr_terminal_operation_recovery";
            artifact = this.insertGeneric("transfer_reversals", {
                payment_id: paymentId,
                transfer_id: transfer.id,
                operation_id: operation.id,
                reversal_request_id: "reversal-terminal-operation-recovery",
                stripe_transfer_reversal_id: providerObjectId,
                amount: 1080,
                currency: "eur",
                status: "succeeded",
                provider_snapshot: { id: providerObjectId, status: "succeeded" },
            });
        } else {
            providerObjectId = "re_terminal_operation_recovery";
            artifact = this.insertGeneric("refunds", {
                payment_id: paymentId,
                operation_id: operation.id,
                refund_request_id: "refund-terminal-operation-recovery",
                commerce_refund_request_id: 701,
                stripe_refund_id: providerObjectId,
                stripe_charge_id: "ch_terminal_operation_recovery",
                amount: 1200,
                required_reversal_amount: 0,
                seller_entitlement_reduction_amount: 0,
                authorized_seller_amount_after_refund: 1080,
                currency: "eur",
                status: "pending",
                provider_snapshot: { id: providerObjectId, status: "pending" },
            });
        }
        return {
            kind,
            paymentId,
            operationId: Number(operation.id),
            artifactId: Number(artifact.id),
            providerObjectId,
        };
    }
}
