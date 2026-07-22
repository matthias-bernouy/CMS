import type { CreateDashboardReadHarness } from "../dashboard-contract-harness";
import { registerExceptionDashboardContracts } from "./exceptions";
import { registerOperationDashboardContracts } from "./operations";

export function registerOperationAndExceptionDashboardContracts(createHarness: CreateDashboardReadHarness): void {
    registerOperationDashboardContracts(createHarness);
    registerExceptionDashboardContracts(createHarness);
}
