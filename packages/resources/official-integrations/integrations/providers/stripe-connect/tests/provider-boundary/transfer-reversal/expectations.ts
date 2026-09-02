import type { JsonRecord, StripeRequestRecord } from "../harness";
import type { TransferReversalFixture } from "./harness";

export function expectedRecovery(
    fixture: TransferReversalFixture,
    actual: JsonRecord,
    providerReversalId: string,
    requestId = "direct-reversal-1",
): JsonRecord {
    const reversal = fixture.harness.rest.rows("transfer_reversals")[0]!;
    const operation = fixture.harness.rest
        .rows("financial_operations")
        .find((row) => row.operation_type === "transfer_reversal_create")!;
    const providerSnapshot = {
        id: providerReversalId,
        amount: 1080,
        currency: "eur",
        metadata: { operation_key: operation.business_key },
    };
    return {
        recoveryId: actual.recoveryId,
        paymentId: fixture.paymentId,
        recoveryRequestId: requestId,
        exposureType: "refund_recovery",
        requestedAmount: 1080,
        allocatedAmount: 1080,
        confirmedAmount: 1080,
        allocationShortfallAmount: 0,
        currency: "eur",
        status: "succeeded",
        reversals: [
            {
                reversalId: reversal.id,
                providerOperationId: operation.id,
                paymentId: fixture.paymentId,
                reversalRequestId: reversal.reversal_request_id,
                stripeTransferReversalId: providerReversalId,
                amount: 1080,
                currency: "eur",
                status: "succeeded",
                occurredAt: reversal.updated_at,
                providerSnapshot,
                createdAt: reversal.created_at,
                updatedAt: reversal.updated_at,
            },
        ],
        createdAt: actual.createdAt,
        updatedAt: actual.updatedAt,
    };
}

export async function reversalIdempotencyKey(businessKey: string): Promise<string> {
    return await stripeIdempotencyKey("transfer-reversal", businessKey);
}

export async function initialPayoutHoldRequests(fixture: TransferReversalFixture): Promise<StripeRequestRecord[]> {
    const operation = fixture.harness.rest
        .rows("financial_operations")
        .find((row) => row.operation_type === "payout_schedule_update" && row.attempt_count === 1)!;
    const stripeAccount = String(fixture.harness.rest.rows("accounts")[0]?.stripe_account_id);
    return [
        {
            method: "GET",
            pathname: "/v1/balance_settings",
            searchParams: [],
            idempotencyKey: null,
            stripeAccount,
        },
        {
            method: "POST",
            pathname: "/v1/balance_settings",
            searchParams: [],
            idempotencyKey: await stripeIdempotencyKey("payout-schedule", String(operation.business_key)),
            stripeAccount,
        },
    ];
}

export function payoutHoldReadRequest(fixture: TransferReversalFixture): StripeRequestRecord {
    return {
        method: "GET",
        pathname: "/v1/balance_settings",
        searchParams: [],
        idempotencyKey: null,
        stripeAccount: String(fixture.harness.rest.rows("accounts")[0]?.stripe_account_id),
    };
}

async function stripeIdempotencyKey(namespace: string, businessKey: string): Promise<string> {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(businessKey));
    const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `cms:${namespace}:${hash}`;
}
