import { registerConnectedPayoutHoldScenario } from "./connected-hold.contracts";
import { registerConnectedPayoutControlScenario } from "./connected-control.contracts";
import type { CreatePayoutScenarioHarness } from "./harness";
import { registerPlatformPayoutAmbiguityScenario } from "./platform-ambiguity.contracts";
import { registerPlatformPayoutControlScenarios } from "./platform-controls.contracts";
import { registerPlatformPayoutFailureScenario } from "./platform-failure.contracts";
import { registerPlatformPayoutHealthScenarios } from "./platform-health.contracts";

export function registerPayoutSourceScenarios(createHarness: CreatePayoutScenarioHarness): void {
    registerPlatformPayoutHealthScenarios(createHarness);
    registerConnectedPayoutHoldScenario(createHarness);
    registerPlatformPayoutControlScenarios(createHarness);
    registerPlatformPayoutAmbiguityScenario(createHarness);
    registerPlatformPayoutFailureScenario(createHarness);
    registerConnectedPayoutControlScenario(createHarness);
}
