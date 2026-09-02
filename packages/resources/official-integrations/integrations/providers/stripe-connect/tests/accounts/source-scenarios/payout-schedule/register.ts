import { registerSellerPayoutBaselineScenarios } from "./baseline.contracts";
import { registerSellerPayoutConcurrencyScenario } from "./concurrency.contracts";
import { registerSellerPayoutConfigurationScenarios } from "./configuration.contracts";
import type { CreateSellerPayoutScenarioHarness } from "./harness";
import { registerSellerPayoutRecoveryHoldScenario } from "./recovery-hold.contracts";
import { registerSellerPayoutResilienceScenarios } from "./resilience.contracts";
import { registerSellerPayoutRestorationScenarios } from "./restoration.contracts";

export function registerSellerPayoutSourceScenarios(createHarness: CreateSellerPayoutScenarioHarness): void {
    registerSellerPayoutConfigurationScenarios(createHarness);
    registerSellerPayoutRecoveryHoldScenario(createHarness);
    registerSellerPayoutConcurrencyScenario(createHarness);
    registerSellerPayoutRestorationScenarios(createHarness);
    registerSellerPayoutBaselineScenarios(createHarness);
    registerSellerPayoutResilienceScenarios(createHarness);
}
