import { registerOperationAndExceptionDashboardContracts } from "../../integration-contracts/dashboard/operations-exceptions";
import { registerPaymentDashboardContracts } from "../../integration-contracts/dashboard/payments.contracts";
import { registerRefundAndDisputeDashboardContracts } from "../../integration-contracts/dashboard/refunds-disputes";
import type { BoundaryHarnesses } from "./harnesses";

export function registerDashboardBoundaryContracts(harnesses: BoundaryHarnesses): void {
    registerRefundAndDisputeDashboardContracts(harnesses.dashboard);
    registerOperationAndExceptionDashboardContracts(harnesses.dashboard);
    registerPaymentDashboardContracts(harnesses.dashboard);
}
