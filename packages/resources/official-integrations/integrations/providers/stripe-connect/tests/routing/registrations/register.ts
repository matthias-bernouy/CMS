import { registerDashboardBoundaryContracts } from "./dashboard";
import { createBoundaryHarnesses, type CreateStripeConnectHarness } from "./harnesses";
import { registerProviderBoundaryContracts } from "./provider-boundary";
import { registerReconciliationBoundaryContracts } from "./reconciliation";
import { registerRepositoryAndPaymentContracts } from "./repository-payments";
import { registerRoutingAndAccountContracts } from "./routing-accounts";

export function registerStripeConnectBoundaryContracts(createHarness: CreateStripeConnectHarness): void {
    const harnesses = createBoundaryHarnesses(createHarness);
    registerDashboardBoundaryContracts(harnesses);
    registerProviderBoundaryContracts(harnesses);
    registerRepositoryAndPaymentContracts(harnesses);
    registerReconciliationBoundaryContracts(harnesses);
    registerRoutingAndAccountContracts(harnesses);
}
