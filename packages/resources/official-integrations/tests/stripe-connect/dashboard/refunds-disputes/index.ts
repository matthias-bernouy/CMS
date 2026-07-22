import type { CreateDashboardReadHarness } from "../dashboard-contract-harness";
import { registerDisputeDashboardContracts } from "./disputes";
import { registerRefundDashboardContracts } from "./refunds";

export function registerRefundAndDisputeDashboardContracts(createHarness: CreateDashboardReadHarness): void {
    registerRefundDashboardContracts(createHarness);
    registerDisputeDashboardContracts(createHarness);
}
