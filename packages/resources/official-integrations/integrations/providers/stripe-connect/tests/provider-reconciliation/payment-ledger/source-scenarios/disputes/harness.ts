import type { SourceRequestHarness } from "../../../../runtime/source-requests";
import type { JsonRecord } from "../../../../runtime/types";

export type DisputeRecoveryScenarioHarness = SourceRequestHarness & {
    rest: {
        readonly lastTransferParameters: Record<string, string> | null;
        readonly moneyCallOrder: string[];
        addProviderDispute(chargeId: string, patch?: JsonRecord): void;
        addProviderRefund(chargeId: string): void;
        clearProviderRefunds(): void;
        injectInFlightTransferBeforeNextRefundReservation(paymentId: number, amount: number): void;
        rejectTransferReversals(): void;
        rows(table: string): JsonRecord[];
        seedSucceededTransfer(paymentId: number, amount: number): void;
        setPaymentIntentSucceeded(paymentIntentId: string): void;
        updateProviderDispute(disputeId: string, patch: JsonRecord): void;
    };
    edgeRequest(request: Request): Promise<Response>;
};

export type CreateDisputeRecoveryScenarioHarness = () => Promise<DisputeRecoveryScenarioHarness>;
