import type { FinancialOperationRow } from "../../db/records/operations.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export function publicFinancialOperation(
    row: FinancialOperationRow,
    payment: Pick<ConnectPaymentRow, "client_reference_id" | "currency"> | null,
): JsonRecord {
    return {
        providerOperationId: row.id,
        paymentId: row.payment_id,
        providerPaymentId: row.payment_id,
        clientReferenceId: payment?.client_reference_id ?? null,
        businessKey: row.business_key,
        operationType: row.operation_type,
        status: row.status,
        amount: Number.isSafeInteger(row.request.amount) ? row.request.amount : 0,
        currency: typeof row.request.currency === "string" ? row.request.currency : (payment?.currency ?? ""),
        releaseAuthorizationId:
            typeof row.request.releaseAuthorizationId === "string" ? row.request.releaseAuthorizationId : null,
        refundRequestId: typeof row.request.refundRequestId === "string" ? row.request.refundRequestId : null,
        commerceRefundRequestId: Number.isSafeInteger(row.request.commerceRefundRequestId)
            ? row.request.commerceRefundRequestId
            : null,
        stripeObjectId: row.stripe_object_id,
        request: redactFinancialOperationData(row.request),
        response: row.response ? redactFinancialOperationData(row.response) : null,
        lastError: row.last_error,
        attemptCount: row.attempt_count,
        nextAttemptAt: row.next_attempt_at,
        claimedAt: row.claimed_at,
        completedAt: row.completed_at,
        providerEventId: `operation:${row.id}:${row.status}`,
        occurredAt: row.updated_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function redactFinancialOperationData(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(redactFinancialOperationData);
    }
    if (!isRecord(value)) {
        return value;
    }
    const redacted: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
        const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (
            [
                "clientsecret",
                "secret",
                "stripeapikey",
                "apikey",
                "authorization",
                "accesstoken",
                "refreshtoken",
                "bankaccounttoken",
                "accounttoken",
            ].includes(normalized)
        ) {
            continue;
        }
        redacted[key] = redactFinancialOperationData(entry);
    }
    return redacted;
}
