import { registerRefundFeeAccountingScenario } from "./fee-accounting.contracts";
import type { CreateProtectedRefundSourceHarness } from "./harness";
import { registerProjectionLeaseScenario } from "./projection-leases/contracts";
import { registerRefundRecoveryHoldScenario } from "./recovery-hold.contracts";
import { registerRefundLifecycleSourceScenarios } from "./refund-lifecycle/register";
import { registerSettlementRefundScenario } from "./settlement-refund.contracts";
import { registerTransferRecoverySourceScenarios } from "./transfer-recovery/register";

export function registerProtectedRefundSourceScenarios(createHarness: CreateProtectedRefundSourceHarness): void {
    registerSettlementRefundScenario(createHarness);
    registerRefundFeeAccountingScenario(createHarness);
    registerRefundRecoveryHoldScenario(createHarness);
    registerProjectionLeaseScenario(createHarness);
    registerTransferRecoverySourceScenarios(createHarness);
    registerRefundLifecycleSourceScenarios(createHarness);
}
