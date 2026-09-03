import type { PostgrestRequestRecord } from "../../integration-contracts/dashboard/dashboard-contract-harness";
import type { ProtectedRefundSearchScenario } from "../../provider-boundary/harness";
import type { ProtectedPaymentProjectionScenario } from "../../provider-boundary/protected-payment/projection-race-harness";
import type { JsonRecord, StripeRequestRecord } from "../types";

export class StripeMockState {
    currentMarketplaceTermsConfiguration: JsonRecord | null = null;
    readonly tables: Record<string, JsonRecord[]> = {
        accounts: [],
        marketplace_terms_acceptances: [],
        platform_payout_controls: [
            {
                control_key: "default",
                liability_revision: 0,
                required_minimum_amount: 0,
                provider_minimum_amount: 0,
                decrease_authorization_id: null,
                claim_owner: null,
                claimed_at: null,
                last_error: null,
                last_provider_sync_at: null,
            },
        ],
        payments: [],
        payment_lifecycle_guards: [],
        payment_events: [],
        financial_operations: [],
        commerce_projection_outbox: [],
        commerce_projection_interventions: [],
        transfers: [],
        transfer_recovery_requests: [],
        transfer_reversals: [],
        seller_recovery_exposures: [],
        refunds: [],
        stripe_disputes: [],
        stripe_dispute_evidence: [],
        irreversible_dispute_action_approvals: [],
        stripe_events: [],
        payout_events: [],
        reconciliation_runs: [],
        provider_exceptions: [],
    };
    nextPaymentId = 1;
    nextRowId = 1;
    nextIntentId = 1;
    nextTransferId = 1;
    nextReversalId = 1;
    nextRefundId = 1;
    nextRefundStatus: "succeeded" | "pending" | "failed" = "succeeded";
    nextRefundFee = 0;
    loseNextRefundResponse = false;
    nextRefundSearchScenario: ProtectedRefundSearchScenario | null = null;
    nextRefundOperationSucceeded = false;
    nextRefundReloadPause: { entered: () => void; wait: Promise<void> } | null = null;
    nextPostgrestReadPause: {
        table: string;
        readsToSkip: number;
        entered: () => void;
        wait: Promise<void>;
    } | null = null;
    failTransferReversals = false;
    failNextTransferCreation = false;
    loseNextTransferCreationResponse = false;
    omitProviderTransfersFromNextList = false;
    loseTransferReversalResponseAt: number | null = null;
    nextTransferReversalScenario:
        | "operation-succeeded"
        | "metadata-match"
        | "manual-review-no-match"
        | "ambiguous"
        | "has-more"
        | null = null;
    nextTransferReversalListHasMore = false;
    inFlightTransferBeforeRefund: { paymentId: number; amount: number } | null = null;
    failBalanceSettingsUpdates = false;
    nextSellerBalanceSettingsPause: { entered: () => void; wait: Promise<void> } | null = null;
    nextPlatformBalanceSettingsReadPause: { entered: () => void; wait: Promise<void> } | null = null;
    nextPlatformBalanceSettingsPause: { entered: () => void; wait: Promise<void> } | null = null;
    loseNextPlatformBalanceSettingsResponse = false;
    loseNextSellerBalanceSettingsResponse = false;
    omitMinimumBalanceOnNextUpdate = false;
    addSellerRiskDuringNextAutomaticRestore = false;
    loseNextPaymentCancellationResponse = false;
    returnNextPaymentCancellationNonTerminal = false;
    failNextPaymentCancellationReservation = false;
    failPaymentProjectionEnqueue = false;
    failFinancialOperationFailureUpdate = false;
    failDisputeFileUpload = false;
    failNextPaymentIntentCreation = false;
    nextPostgrestWriteFailure: { table: string; method: "POST" | "PATCH" } | null = null;
    nextProtectedPaymentReservationFailure: "missing" | "raced" | null = null;
    linkNextProtectedPaymentReservation = false;
    nextPaymentIntentOperationSucceeded = false;
    nextPaymentIntentProjectionManualReview = false;
    nextProtectedPaymentProjectionScenario: ProtectedPaymentProjectionScenario | null = null;
    failProviderExceptionResolution = false;
    failPaymentReconciliationLedgerRead = false;
    failPaymentReconciliationLocalContextRead = false;
    failAccountReloadAfterTermsAcceptance = false;
    nextAccountReadFailureStatus: 403 | 503 | null = null;
    omitNextAccountRead = false;
    omitNextPaymentReadResult = false;
    providerTransferContextReadsBeforeFailure: number | null = null;
    failProviderDisputeList = false;
    failProviderRefundList = false;
    failProviderTransferList = false;
    losePaymentProjectionEnqueueResponse = false;
    failPaymentIntentRetrieve = false;
    paymentIntentReplacementOnNextRetrieve: { paymentId: number; replacementId: string } | null = null;
    readonly paymentIntents = new Map<string, JsonRecord>();
    readonly providerCharges = new Map<string, JsonRecord>();
    readonly providerBalanceTransactions = new Map<string, JsonRecord>();
    readonly providerTransfers: JsonRecord[] = [];
    readonly providerTransferReversals = new Map<string, JsonRecord[]>();
    readonly providerRefunds: JsonRecord[] = [];
    readonly providerDisputes: JsonRecord[] = [];
    readonly providerPayouts = new Map<string, JsonRecord>();
    availableEur = 4500;
    readonly stripeAccountState = new Map<string, JsonRecord>();
    readonly customAccountIds = new Set<string>();
    lastPaymentIntentParameters: URLSearchParams | null = null;
    lastTransferParameters: Record<string, string> | null = null;
    readonly transferReversalRequests: Array<{
        transferId: string;
        parameters: Array<[string, string]>;
        idempotencyKey: string | null;
    }> = [];
    readonly moneyCallOrder: string[] = [];
    readonly accountCreationRequests: Array<{ body: JsonRecord; idempotencyKey: string | null }> = [];
    readonly accountLinkRequests: JsonRecord[] = [];
    readonly accountUpdateRequests: Array<{
        accountId: string;
        body: JsonRecord;
        idempotencyKey: string | null;
    }> = [];
    readonly externalRequestOrder: string[] = [];
    readonly fileUploadRequests: Array<{
        purpose: string;
        fileName: string;
        mimeType: string;
        content: number[];
    }> = [];
    readonly refundCreateRequests: Array<{
        parameters: Array<[string, string]>;
        idempotencyKey: string | null;
    }> = [];
    readonly postgrestRequests: PostgrestRequestRecord[] = [];
    readonly stripeRequests: StripeRequestRecord[] = [];
    paymentIntentCreateCount = 0;
    chargeRetrieveCount = 0;
    balanceTransactionRetrieveCount = 0;
    balanceSettingsUpdateCount = 0;
    balanceSettings: JsonRecord = {
        object: "balance_settings",
        payments: {
            debit_negative_balances: false,
            payouts: {
                minimum_balance_by_currency: {},
                schedule: { interval: "daily" },
                status: "enabled",
            },
            settlement_timing: { delay_days: 2, delay_days_override: null },
        },
    };
    platformBalanceSettings: JsonRecord = {
        object: "balance_settings",
        payments: {
            debit_negative_balances: true,
            payouts: { minimum_balance_by_currency: {}, schedule: { interval: "daily" }, status: "enabled" },
            settlement_timing: { delay_days: 2, delay_days_override: null },
        },
    };

    setCurrentMarketplaceTermsConfiguration(configuration: JsonRecord | null): void {
        this.currentMarketplaceTermsConfiguration = configuration ? structuredClone(configuration) : null;
    }
}
