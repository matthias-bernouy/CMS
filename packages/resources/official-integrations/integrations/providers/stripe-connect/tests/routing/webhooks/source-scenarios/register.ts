import { registerConnectedWebhookSourceScenarios } from "./connected.contracts";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { registerPlatformWebhookSourceScenario } from "./platform.contracts";
export { registerWebhookRecoverySourceScenario } from "./recovery.contracts";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerWebhookSourceScenarios(createHarness: CreateHarness): void {
    registerPlatformWebhookSourceScenario(createHarness);
    registerConnectedWebhookSourceScenarios(createHarness);
}
