import type { CreateDisputeRecoveryScenarioHarness } from "../harness";
import { registerIndependentRefundQuarantineScenario } from "./refund.contracts";
import { registerDisputeReleaseSafeguardScenarios } from "./release.contracts";

export function registerDisputeLedgerSafeguardScenarios(createHarness: CreateDisputeRecoveryScenarioHarness): void {
    registerDisputeReleaseSafeguardScenarios(createHarness);
    registerIndependentRefundQuarantineScenario(createHarness);
}
