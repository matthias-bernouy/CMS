import type { SourceRequestHarness } from "../../../runtime/source-requests";
import type { JsonRecord, StripeRequestRecord } from "../../../runtime/types";

export type PaymentRecoveryScenarioRest = {
    readonly balanceTransactionRetrieveCount: number;
    readonly chargeRetrieveCount: number;
    readonly stripeRequests: StripeRequestRecord[];
    clearStripeRequests(): void;
    patchLatestCharge(paymentIntentId: string, patch: JsonRecord): void;
    patchPaymentIntent(paymentIntentId: string, patch: JsonRecord): void;
    patchPaymentIntentMetadata(paymentIntentId: string, patch: JsonRecord): void;
    patchProviderBalanceTransaction(paymentIntentId: string, patch: JsonRecord): void;
    removeTransientProviderTruthException(paymentId: number, paymentIntentId: string): void;
    rows(table: string): JsonRecord[];
    seedOtherOpenProviderException(paymentId: number): void;
    seedTransientProviderTruthReview(paymentId: number, paymentIntentId: string): void;
    setPaymentIntentProviderReferences(paymentIntentId: string): void;
    setPaymentIntentSucceeded(paymentIntentId: string): void;
};

export type PaymentRecoveryScenarioHarness = SourceRequestHarness & {
    rest: PaymentRecoveryScenarioRest;
    edgeRequest(request: Request): Promise<Response>;
};

export type CreatePaymentRecoveryScenarioHarness = () => Promise<PaymentRecoveryScenarioHarness>;
