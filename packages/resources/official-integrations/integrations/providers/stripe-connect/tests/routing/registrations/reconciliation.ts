import { registerProviderReconciliationBudgets } from "../../provider-reconciliation/budgets";
import { registerProviderReconciliationContracts } from "../../provider-reconciliation/contracts";
import { registerProviderExceptionResolutionContracts } from "../../provider-reconciliation/exception-resolution";
import { registerTerminalOperationRecoveryContracts } from "../../provider-reconciliation/operation-recovery/terminal-contracts";
import { registerSettlementReleaseFailureContracts } from "../../provider-reconciliation/operation-recovery/settlement-release/failures.contracts";
import { registerSettlementReleaseLedgerFreshnessContracts } from "../../provider-reconciliation/operation-recovery/settlement-release/ledger-freshness.contracts";
import { registerSettlementReleaseReadOrderContracts } from "../../provider-reconciliation/operation-recovery/settlement-release/read-order.contracts";
import { registerSettlementReleaseRecoveryContracts } from "../../provider-reconciliation/operation-recovery/settlement-release/recovery.contracts";
import { registerSettlementReleaseReplayContracts } from "../../provider-reconciliation/operation-recovery/settlement-release/replay.contracts";
import { registerSettlementReleaseValidationContracts } from "../../provider-reconciliation/operation-recovery/settlement-release/validations.contracts";
import { registerPaymentReconciliationLedgerContracts } from "../../provider-reconciliation/payment-ledger/contracts";
import { registerPaymentReconciliationLedgerDivergenceContracts } from "../../provider-reconciliation/payment-ledger/divergence";
import { registerPaymentReconciliationProviderFailureContracts } from "../../provider-reconciliation/payment-ledger/provider-failures.contracts";
import { registerStalePaymentLocalContextContracts } from "../../provider-reconciliation/payment-ledger/stale-local-context";
import { registerStalePaymentLocalContextFailureContracts } from "../../provider-reconciliation/payment-ledger/stale-local-context-failures";
import { registerProviderTransferContextContracts } from "../../provider-reconciliation/provider-transfer-context/contracts";
import { registerProviderTransferContextFailureContracts } from "../../provider-reconciliation/provider-transfer-context/failures";
import type { BoundaryHarnesses } from "./harnesses";

export function registerReconciliationBoundaryContracts(harnesses: BoundaryHarnesses): void {
    const createHarness = harnesses.reconciliation;
    registerProviderReconciliationContracts(createHarness);
    registerProviderReconciliationBudgets(createHarness);
    registerProviderExceptionResolutionContracts(createHarness);
    registerPaymentReconciliationLedgerContracts(createHarness);
    registerPaymentReconciliationLedgerDivergenceContracts(createHarness);
    registerPaymentReconciliationProviderFailureContracts(createHarness);
    registerStalePaymentLocalContextContracts(createHarness);
    registerStalePaymentLocalContextFailureContracts(createHarness);
    registerProviderTransferContextContracts(createHarness);
    registerProviderTransferContextFailureContracts(createHarness);
    registerTerminalOperationRecoveryContracts(createHarness);
    registerSettlementReleaseValidationContracts(createHarness);
    registerSettlementReleaseRecoveryContracts(createHarness);
    registerSettlementReleaseFailureContracts(createHarness);
    registerSettlementReleaseReplayContracts(createHarness);
    registerSettlementReleaseReadOrderContracts(createHarness);
    registerSettlementReleaseLedgerFreshnessContracts(createHarness);
}
