import { registerAccountContractSourceScenarios } from "./account-contracts";
import { registerRuntimeModeSourceScenarios } from "./runtime-mode.contracts";
import { registerStaticRecoverySourceScenario } from "./static-recovery.contracts";
import type { StripeConnectHarness } from "../../../runtime/harness";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerRootSourceScenarios(createHarness: CreateHarness): void {
    registerStaticRecoverySourceScenario();
    registerAccountContractSourceScenarios(createHarness);
    registerRuntimeModeSourceScenarios(createHarness);
}
