import { registerPlatformReserveDecreaseSourceScenarios } from "./decrease.contracts";
import { registerPlatformReserveIncreaseSourceScenarios } from "./increase.contracts";
import { registerPlatformMinimumSourceScenarios } from "./minimum.contracts";
import type { StripeConnectHarness } from "../../../../runtime/harness";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerPlatformProtectionSourceScenarios(createHarness: CreateHarness): void {
    registerPlatformMinimumSourceScenarios(createHarness);
    registerPlatformReserveIncreaseSourceScenarios(createHarness);
    registerPlatformReserveDecreaseSourceScenarios(createHarness);
}
