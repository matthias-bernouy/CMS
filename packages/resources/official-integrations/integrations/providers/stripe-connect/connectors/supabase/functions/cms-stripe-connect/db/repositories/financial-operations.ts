import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { HttpError } from "../../http/errors.ts";
import { callRpcObject, firstRow, rest, restError, updateRow } from "../postgrest.ts";
import { operationSelect, type FinancialOperationRow } from "../records/operations.ts";
import type { ConnectPaymentRow } from "../records/payments.ts";

export type PaymentCancellationOperationContext = {
    payment: ConnectPaymentRow;
    operation: FinancialOperationRow;
};

export async function reservePaymentCancellationOperation(
    paymentId: number,
    clientReferenceId: string,
    options: { businessKey: string; request: JsonRecord },
): Promise<PaymentCancellationOperationContext> {
    const value = await callRpcObject<unknown>("reserve_payment_cancellation_operation", {
        p_payment_id: paymentId,
        p_client_reference_id: clientReferenceId,
        p_business_key: options.businessKey,
        p_request: options.request,
    });
    if (!isRecord(value) || !isRecord(value.payment) || !isRecord(value.operation)) {
        throw new HttpError(502, "payment cancellation reservation returned an invalid response");
    }
    return {
        payment: value.payment as unknown as ConnectPaymentRow,
        operation: value.operation as unknown as FinancialOperationRow,
    };
}

export async function reserveFinancialOperation(
    paymentId: number,
    options: { businessKey: string; operationType: string; request: JsonRecord },
): Promise<FinancialOperationRow> {
    const response = await rest("rpc/reserve_financial_operation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_payment_id: paymentId,
            p_business_key: options.businessKey,
            p_operation_type: options.operationType,
            p_request: options.request,
        }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const value = await response.json();
    if (isRecord(value)) {
        return value as FinancialOperationRow;
    }
    return firstRow<FinancialOperationRow>(value);
}

export async function reserveAccountFinancialOperation(
    userId: string,
    options: { businessKey: string; operationType: string; request: JsonRecord },
): Promise<FinancialOperationRow> {
    const response = await rest("rpc/reserve_account_financial_operation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_cms_user_id: userId,
            p_business_key: options.businessKey,
            p_operation_type: options.operationType,
            p_request: options.request,
        }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const value = await response.json();
    if (isRecord(value)) {
        return value as FinancialOperationRow;
    }
    return firstRow<FinancialOperationRow>(value);
}

export async function reservePlatformFinancialOperation(options: {
    businessKey: string;
    operationType: string;
    request: JsonRecord;
}): Promise<FinancialOperationRow> {
    const response = await rest("rpc/reserve_platform_financial_operation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_business_key: options.businessKey,
            p_operation_type: options.operationType,
            p_request: options.request,
        }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const value = await response.json();
    if (isRecord(value)) {
        return value as FinancialOperationRow;
    }
    return firstRow<FinancialOperationRow>(value);
}

export async function updateFinancialOperation(
    operationId: number,
    values: JsonRecord,
): Promise<FinancialOperationRow | null> {
    return await updateRow<FinancialOperationRow>("financial_operations", operationId, values, operationSelect);
}

export async function enqueueCommerceProviderProjection(
    paymentId: number,
    projectionKey: string,
    projectionKind: "payment" | "dispute",
    providerObjectId: string,
): Promise<void> {
    await callRpcObject<JsonRecord>("enqueue_commerce_provider_projection", {
        p_payment_id: paymentId,
        p_projection_key: projectionKey,
        p_projection_kind: projectionKind,
        p_provider_object_id: providerObjectId,
    });
}

export async function enqueueCommerceRefundProjection(refundId: number): Promise<void> {
    await callRpcObject<JsonRecord>("enqueue_commerce_refund_projection", {
        p_refund_id: refundId,
    });
}
