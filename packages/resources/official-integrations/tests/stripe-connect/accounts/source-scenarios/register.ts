import { registerAccountEnrollmentSourceScenario } from "./enrollment.contracts";
import type { CreateAccountSourceScenarioHarness } from "./harness";
import { registerHeldPaymentSourceScenario } from "./held-payment.contracts";
import { registerMarketplaceTermsAuthoritySourceScenario } from "./marketplace-terms-authority.contracts";
import { registerAccountOnboardingSourceScenarios } from "./onboarding.contracts";
import { registerAccountVerificationSourceScenarios } from "./verification.contracts";

export function registerAccountSourceScenarios(createHarness: CreateAccountSourceScenarioHarness): void {
    registerAccountOnboardingSourceScenarios(createHarness);
    registerAccountEnrollmentSourceScenario(createHarness);
    registerHeldPaymentSourceScenario(createHarness);
    registerMarketplaceTermsAuthoritySourceScenario(createHarness);
    registerAccountVerificationSourceScenarios(createHarness);
}
