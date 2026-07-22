import { registerTransferRecoveryDisputeScenarios } from "./disputes.contracts";
import type { CreateProtectedRefundSourceHarness } from "../harness";
import { registerTransferRecoveryRefundScenarios } from "./refunds.contracts";

export function registerTransferRecoverySourceScenarios(createHarness: CreateProtectedRefundSourceHarness): void {
    registerTransferRecoveryRefundScenarios(createHarness);
    registerTransferRecoveryDisputeScenarios(createHarness);
}
