import { expect } from "bun:test";
import type { JsonRecord, SettlementReleaseFixture, StripeRequestRecord } from "./harness";

export function expectedTransfer(fixture: SettlementReleaseFixture, transfer: JsonRecord, amount = 1080): JsonRecord {
    return {
        transferId: transfer.id,
        providerOperationId: transfer.operation_id,
        paymentId: fixture.paymentId,
        releaseAuthorizationId: fixture.releaseAuthorizationId,
        stripeTransferId: transfer.stripe_transfer_id,
        releaseKind: "initial",
        sourceChargeId: fixture.chargeId,
        destinationAccountId: fixture.accountId,
        amount,
        currency: "eur",
        status: "succeeded",
        occurredAt: "2026-07-06T12:10:00.000Z",
        createdAt: "2026-07-06T12:05:00.000Z",
        updatedAt: "2026-07-06T12:10:00.000Z",
    };
}

export function expectedNonterminalRecoveryResponse(fixture: SettlementReleaseFixture): JsonRecord {
    return {
        runId: expect.any(Number),
        runKey: "settlement-nonterminal-recovery",
        status: "succeeded",
        scannedCount: 1,
        repairedCount: 1,
        exceptionCount: 0,
        details: {
            stripeApiVersion: "2026-02-25.clover",
            processedStripeEvents: 0,
            recoveredFinancialOperations: 1,
            reconciledStalePayments: 0,
            reconciledSellerRiskAccounts: 0,
            reconciledManualPayoutHolds: 0,
            platformPayoutInterval: "daily",
            platformPayoutMinimum: 0,
            platformRequiredMinimum: 0,
            workBudgetLimit: 1,
            workBudgetConsumed: 1,
        },
        finishedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        payments: [
            expect.objectContaining({
                paymentId: fixture.paymentId,
                settlementStatus: "released",
                transferredAmount: 1080,
            }),
        ],
        operations: [
            expect.objectContaining({
                paymentId: fixture.paymentId,
                operationType: "payment_intent_create",
                status: "succeeded",
            }),
        ],
        commerceOperations: [],
        disputes: [],
    };
}

export function matchingProviderTransfer(fixture: SettlementReleaseFixture): JsonRecord {
    return {
        amount: 1080,
        currency: "eur",
        destination: fixture.accountId,
        source_transaction: fixture.chargeId,
        transfer_group: fixture.transferGroup,
        metadata: {
            cms_payment_id: String(fixture.paymentId),
            cms_release_authorization_id: fixture.releaseAuthorizationId,
            cms_release_kind: "initial",
        },
    };
}

export function transferCreateRequest(idempotencyKey: string): StripeRequestRecord {
    return {
        method: "POST",
        pathname: "/v1/transfers",
        searchParams: [],
        idempotencyKey,
        stripeAccount: null,
    };
}

export const providerReconciliationRequests: Array<[string, string]> = [
    ["GET", "/v1/payment_intents/pi_1"],
    ["GET", "/v1/disputes"],
    ["GET", "/v1/refunds"],
    ["GET", "/v1/transfers"],
];

export const successfulSettlementDatabaseCalls: Array<[string, string]> = [
    ["GET", "payments"],
    ["POST", "rpc/apply_payment_provider_projection"],
    ["POST", "rpc/read_payment_reconciliation_local_context"],
    ["POST", "rpc/read_payment_reconciliation_ledger"],
    ["PATCH", "payments"],
    ["GET", "accounts"],
    ["GET", "transfers"],
    ["GET", "refunds"],
    ["POST", "rpc/reserve_financial_operation"],
    ["POST", "transfers"],
    ["PATCH", "financial_operations"],
    ["PATCH", "transfers"],
    ["PATCH", "transfers"],
    ["PATCH", "financial_operations"],
    ["GET", "transfers"],
    ["GET", "transfer_reversals"],
    ["GET", "refunds"],
    ["PATCH", "payments"],
];

export const nonterminalRecoveryDatabaseCalls: Array<[string, string]> = [
    ["POST", "rpc/claim_financial_operations"],
    ["POST", "rpc/read_financial_operation_recovery_context"],
    ["POST", "rpc/apply_payment_provider_projection"],
    ["POST", "rpc/read_payment_reconciliation_local_context"],
    ["POST", "rpc/read_payment_reconciliation_ledger"],
    ["PATCH", "payments"],
    ["GET", "accounts"],
    ["GET", "transfers"],
    ["GET", "refunds"],
    ["POST", "rpc/reserve_financial_operation"],
    ["PATCH", "financial_operations"],
    ["PATCH", "transfers"],
    ["PATCH", "transfers"],
    ["PATCH", "financial_operations"],
    ["GET", "transfers"],
    ["GET", "transfer_reversals"],
    ["GET", "refunds"],
    ["PATCH", "payments"],
    ["PATCH", "reconciliation_runs"],
    ["POST", "rpc/read_reconciliation_operations"],
    ["POST", "rpc/claim_reconciliation_projection_batch"],
];
