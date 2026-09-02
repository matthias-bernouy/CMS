import type { JsonRecord } from "../../types";
import { PaymentPersistence } from "./payments";

export class TransferPersistence extends PaymentPersistence {
    applyNextTransferReversalScenario(
        allocations: Array<{
            operation: JsonRecord | undefined;
            reversal: JsonRecord;
            transfer: JsonRecord | undefined;
        }>,
    ): void {
        const scenario = this.nextTransferReversalScenario;
        if (!scenario) {
            return;
        }
        this.nextTransferReversalScenario = null;
        const allocation = allocations[0];
        if (!allocation?.operation || !allocation.transfer) {
            throw new Error("transfer reversal scenario has no allocation");
        }
        const operation = allocation.operation;
        const transferId = String(allocation.transfer.stripe_transfer_id);
        const providerReversal = {
            id: scenario === "operation-succeeded" ? "trr_operation_succeeded" : "trr_metadata_recovered",
            amount: allocation.reversal.amount,
            currency: allocation.reversal.currency,
            metadata: { operation_key: operation.business_key },
        };
        if (scenario === "operation-succeeded") {
            this.update(operation, {
                status: "succeeded",
                stripe_object_id: providerReversal.id,
                attempt_count: 1,
            });
            this.providerTransferReversals.set(transferId, [providerReversal]);
            return;
        }
        this.update(operation, {
            status: scenario === "manual-review-no-match" ? "manual_review" : "processing",
            attempt_count: 1,
        });
        if (scenario === "metadata-match") {
            this.providerTransferReversals.set(transferId, [providerReversal]);
        }
        if (scenario === "ambiguous") {
            this.providerTransferReversals.set(transferId, [
                providerReversal,
                { ...providerReversal, id: "trr_metadata_ambiguous" },
            ]);
        }
        this.nextTransferReversalListHasMore = scenario === "has-more";
    }
}
