import { registerProtectedPaymentCreationScenario } from "./creation.contracts";
import { registerProtectedPaymentEligibilitySourceScenarios } from "./eligibility.contracts";
import { registerProviderBoundarySourceScenario } from "./provider-boundaries/contracts";
import { registerWalletSourceScenario } from "./wallet.contracts";
import type { StripeConnectHarness } from "../../runtime/harness";

export function registerProtectedPaymentSourceScenarios(createHarness: () => Promise<StripeConnectHarness>): void {
    registerProtectedPaymentCreationScenario(createHarness);
    registerProviderBoundarySourceScenario(createHarness);
    registerWalletSourceScenario(createHarness);
}

export { registerProtectedPaymentEligibilitySourceScenarios };
