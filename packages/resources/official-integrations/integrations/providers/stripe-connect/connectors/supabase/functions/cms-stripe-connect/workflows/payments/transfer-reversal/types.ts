import type { FinancialOperationRow } from "../../../db/records/operations.ts";
import type { ConnectPaymentRow } from "../../../db/records/payments.ts";
import type { JsonRecord } from "../../../shared/types.ts";

export type TransferRecoveryExposureType = "chargeback" | "refund_recovery";

export type RecordSellerRecoveryExposure = (
    payment: ConnectPaymentRow,
    recoveryKey: string,
    exposureType: TransferRecoveryExposureType | "reversal_failure",
    status: "at_risk" | "debt" | "recovered",
    amount: number,
    reason: string,
    details: JsonRecord,
    recoveredAmount?: number,
) => Promise<void>;

export type RequiredPayment = (paymentId: number) => Promise<ConnectPaymentRow>;

export type MoveOperationToManualReview = (
    paymentId: number,
    operation: FinancialOperationRow,
    error: unknown,
    exceptionType: string,
) => Promise<void>;
