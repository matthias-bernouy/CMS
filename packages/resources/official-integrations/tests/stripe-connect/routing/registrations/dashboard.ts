import { registerOperationAndExceptionDashboardContracts } from "../../dashboard/operations-exceptions.contracts";
import { registerPaymentDashboardContracts } from "../../dashboard/payments.contracts";
import { registerRefundAndDisputeDashboardContracts } from "../../dashboard/refunds-disputes.contracts";
import type { BoundaryHarnesses } from "./harnesses";

export function registerDashboardBoundaryContracts(harnesses: BoundaryHarnesses): void {
    registerRefundAndDisputeDashboardContracts(harnesses.dashboard);
    registerOperationAndExceptionDashboardContracts(harnesses.dashboard);
    registerPaymentDashboardContracts(harnesses.dashboard);
}
