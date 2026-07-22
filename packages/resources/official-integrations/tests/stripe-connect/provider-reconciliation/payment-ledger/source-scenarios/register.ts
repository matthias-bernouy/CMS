import { registerProviderTruthDivergenceScenarios } from "./divergence.contracts";
import { registerProviderExceptionRecoveryScenarios } from "./exception-recovery.contracts";
import type { CreatePaymentRecoveryScenarioHarness } from "./harness";
import { registerProviderTruthHydrationScenarios } from "./provider-truth.contracts";
import { registerLostPaymentRecoveryScenario } from "./success.contracts";
import { registerAbsentPaymentTombstoneScenario } from "./tombstone.contracts";

export function registerPaymentRecoverySourceScenarios(createHarness: CreatePaymentRecoveryScenarioHarness): void {
    registerLostPaymentRecoveryScenario(createHarness);
    registerProviderTruthHydrationScenarios(createHarness);
    registerProviderExceptionRecoveryScenarios(createHarness);
    registerProviderTruthDivergenceScenarios(createHarness);
    registerAbsentPaymentTombstoneScenario(createHarness);
}
