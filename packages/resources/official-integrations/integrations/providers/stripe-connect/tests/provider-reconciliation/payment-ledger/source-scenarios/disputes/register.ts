import { registerDisputeFundsOrderingScenario } from "./funds-ordering.contracts";
import { registerDisputeFundsWithdrawalScenario } from "./funds-withdrawal.contracts";
import type { CreateDisputeRecoveryScenarioHarness } from "./harness";
import { registerDisputeDebtRecoveryScenarios } from "./recovery-debt.contracts";
import { registerWonDisputeRecoveryScenario } from "./recovery-won.contracts";
import { registerPreTransferDisputeScenarios } from "./release.contracts";
import { registerDisputeLedgerSafeguardScenarios } from "./safeguards/register";

export function registerDisputeRecoverySourceScenarios(createHarness: CreateDisputeRecoveryScenarioHarness): void {
    registerPreTransferDisputeScenarios(createHarness);
    registerDisputeFundsWithdrawalScenario(createHarness);
    registerDisputeFundsOrderingScenario(createHarness);
    registerDisputeDebtRecoveryScenarios(createHarness);
    registerWonDisputeRecoveryScenario(createHarness);
    registerDisputeLedgerSafeguardScenarios(createHarness);
}
