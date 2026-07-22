import type { JsonRecord, ProviderBoundaryHarness } from "../harness";

export type ProtectedPaymentProjectionScenario =
    | { kind: "replace-intent"; paymentId: number; replacementIntentId: string }
    | { kind: "cancel-payment"; paymentId: number; clientSecret: string }
    | { kind: "rotate-secret"; paymentId: number; clientSecret: string };

export type ProjectionRaceHarness = ProviderBoundaryHarness & {
    rest: ProviderBoundaryHarness["rest"] & {
        patchPaymentIntent(paymentIntentId: string, patch: JsonRecord): void;
        setNextProtectedPaymentProjectionScenario(scenario: ProtectedPaymentProjectionScenario): void;
    };
};
