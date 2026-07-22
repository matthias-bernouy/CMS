import type { ProtectedPaymentProjectionScenario } from "../../../provider-boundary/protected-payment/projection-race-harness";
import { PayoutFixtures } from "./payouts";

export class FailureControls extends PayoutFixtures {
    replacePaymentIntentDuringNextRetrieve(paymentId: number, replacementId: string): void {
        this.paymentIntentReplacementOnNextRetrieve = { paymentId, replacementId };
    }

    failNextPaymentProjectionEnqueue(): void {
        this.failPaymentProjectionEnqueue = true;
    }

    failNextFinancialOperationFailureUpdate(): void {
        this.failFinancialOperationFailureUpdate = true;
    }

    failNextDisputeFileUploadOnce(): void {
        this.failDisputeFileUpload = true;
    }

    failNextPaymentIntentCreationOnce(): void {
        this.failNextPaymentIntentCreation = true;
    }

    failNextProtectedPaymentReservation(mode: "missing" | "raced"): void {
        this.nextProtectedPaymentReservationFailure = mode;
    }

    failNextPostgrestWrite(table: string, method: "POST" | "PATCH"): void {
        this.nextPostgrestWriteFailure = { table, method };
    }

    linkNextProtectedPaymentReservationToIntent(): void {
        this.linkNextProtectedPaymentReservation = true;
    }

    quarantineNextPaymentIntentProjection(): void {
        this.nextPaymentIntentProjectionManualReview = true;
    }

    setNextProtectedPaymentProjectionScenario(scenario: ProtectedPaymentProjectionScenario): void {
        this.nextProtectedPaymentProjectionScenario = scenario;
    }

    succeedNextPaymentIntentOperation(): void {
        this.nextPaymentIntentOperationSucceeded = true;
    }

    failNextProviderExceptionResolution(): void {
        this.failProviderExceptionResolution = true;
    }

    failNextPaymentReconciliationLedgerRead(): void {
        this.failPaymentReconciliationLedgerRead = true;
    }

    failNextPaymentReconciliationLocalContextRead(): void {
        this.failPaymentReconciliationLocalContextRead = true;
    }

    loseNextPaymentProjectionEnqueueResponse(): void {
        this.losePaymentProjectionEnqueueResponse = true;
    }

    failNextPaymentIntentRetrieve(): void {
        this.failPaymentIntentRetrieve = true;
    }

    failProviderTransferContextReadAfter(successfulReads: number): void {
        this.providerTransferContextReadsBeforeFailure = successfulReads;
    }

    failNextProviderDisputeList(): void {
        this.failProviderDisputeList = true;
    }

    failNextProviderRefundList(): void {
        this.failProviderRefundList = true;
    }

    failNextProviderTransferList(): void {
        this.failProviderTransferList = true;
    }
}
