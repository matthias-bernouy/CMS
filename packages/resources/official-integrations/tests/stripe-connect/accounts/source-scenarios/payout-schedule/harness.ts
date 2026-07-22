import type { SourceRequestHarness } from "../../../runtime/source-requests";
import type { JsonRecord } from "../../../runtime/types";

export type SellerPayoutScenarioHarness = SourceRequestHarness & {
    rest: {
        readonly balanceSettingsUpdateCount: number;
        addRiskDuringNextSellerAutomaticRestore(): void;
        exposeSellerFinancialRisk(userId: string, amount: number): void;
        loseNextSellerPayoutSettingsResponse(): void;
        markFinancialOperationSucceeded(businessKey: string): void;
        omitMinimumBalanceOnNextBalanceSettingsUpdate(): void;
        pauseNextSellerBalanceSettingsUpdate(): { entered: Promise<void>; resume: () => void };
        rows(table: string): JsonRecord[];
        seedEmergencySellerHold(userId: string, providerMinimumAmount: number, restoreSettings?: JsonRecord): void;
        seedFailedSellerRiskHoldOperation(userId: string, amount: number): string;
        seedPendingStripeEvents(count: number): void;
        setConnectedPayoutSettings(interval: string, minimumBalanceEur: number): void;
        setIndependentSellerRisk(userId: string, reason: string): void;
    };
};

export type CreateSellerPayoutScenarioHarness = () => Promise<SellerPayoutScenarioHarness>;
