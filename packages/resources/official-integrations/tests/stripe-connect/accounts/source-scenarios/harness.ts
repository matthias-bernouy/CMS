import type { SourceRequestHarness } from "../../runtime/source-requests";
import type { JsonRecord } from "../../runtime/types";

export type AccountSourceScenarioHarness = SourceRequestHarness & {
    rest: {
        readonly accountCreationRequests: Array<{ body: JsonRecord; idempotencyKey: string | null }>;
        rows(table: string): JsonRecord[];
        seedActiveLegacyAccount(userId: string): void;
        seedHostedV2AccountWithRequirements(userId: string): void;
        seedLegacyRecipientAccount(userId: string): void;
        setPaymentIntentSucceeded(paymentIntentId: string): void;
        setStripeAccountState(userId: string, patch: JsonRecord): void;
    };
};

export type CreateAccountSourceScenarioHarness = () => Promise<AccountSourceScenarioHarness>;
