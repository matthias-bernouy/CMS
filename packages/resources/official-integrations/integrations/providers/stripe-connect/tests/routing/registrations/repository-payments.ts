import { registerPaymentCancellationFailureContracts } from "../../payments/cancellation/failures.contracts";
import { registerPaymentCancellationRecoveryContracts } from "../../payments/cancellation/recovery.contracts";
import { registerPaymentCancellationReplayContracts } from "../../payments/cancellation/replay.contracts";
import { registerPaymentCancellationReservationContracts } from "../../payments/cancellation/reservation.contracts";
import { registerPaymentProjectionContracts } from "../../payments/projection/contracts";
import { registerPaymentProjectionFailureContracts } from "../../payments/projection/failures";
import { registerPaymentProjectionReplayContracts } from "../../payments/projection/replay";
import { registerAccountTermsRepositoryContracts } from "../../contracts/repository-boundary/accounts-terms.contracts";
import { registerLedgerRepositoryContracts } from "../../contracts/repository-boundary/ledger.contracts";
import { registerPaymentOperationRepositoryContracts } from "../../contracts/repository-boundary/payments-operations.contracts";
import { registerProtectedPaymentEligibilityContracts } from "../../contracts/repository-boundary/protected-payment-eligibility.contracts";
import type { BoundaryHarnesses } from "./harnesses";

export function registerRepositoryAndPaymentContracts(harnesses: BoundaryHarnesses): void {
    registerAccountTermsRepositoryContracts(harnesses.repository);
    registerProtectedPaymentEligibilityContracts(harnesses.repository);
    registerLedgerRepositoryContracts(harnesses.repository);
    registerPaymentOperationRepositoryContracts(harnesses.repository);
    registerPaymentProjectionContracts(harnesses.paymentProjection);
    registerPaymentProjectionFailureContracts(harnesses.paymentProjection);
    registerPaymentProjectionReplayContracts(harnesses.paymentProjection);
    registerPaymentCancellationReplayContracts(harnesses.paymentCancellation);
    registerPaymentCancellationRecoveryContracts(harnesses.paymentCancellation);
    registerPaymentCancellationFailureContracts(harnesses.paymentCancellation);
    registerPaymentCancellationReservationContracts(harnesses.paymentCancellation);
}
