import type { SourceRequestHarness } from "../../../runtime/source-requests";
import type { JsonRecord } from "../../../runtime/types";

export type PayoutScenarioHarness = SourceRequestHarness & {
    rest: {
        rows(table: string): JsonRecord[];
        seedEmergencySellerHold(userId: string, providerMinimumAmount: number): void;
        setPlatformPayoutInterval(interval: string): void;
        setProviderPayout(payout: JsonRecord): void;
    };
    edgeRequest(request: Request): Promise<Response>;
};

export type CreatePayoutScenarioHarness = () => Promise<PayoutScenarioHarness>;
