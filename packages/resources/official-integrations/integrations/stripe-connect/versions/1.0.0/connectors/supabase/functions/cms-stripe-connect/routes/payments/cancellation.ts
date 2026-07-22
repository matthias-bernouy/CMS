import {
    reservePaymentCancellationOperation,
    updateFinancialOperation,
} from "../../db/repositories/financial-operations.ts";
import { reservePaymentCancellationIntent } from "../../db/repositories/payments.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import {
    assertAllowedKeys,
    optionalText,
    readJsonObject,
    requiredInteger,
    requiredString,
} from "../../http/body/index.ts";
import { HttpError } from "../../http/errors.ts";
import { json } from "../../http/responses.ts";
import { errorMessage, isRecord } from "../../shared/data.ts";
import { executePaymentIntentCancellation } from "../../workflows/payments/cancellation.ts";

export async function requestPaymentIntentCancellation(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["clientReferenceId", "cancellationRequestId", "reason"]);
    const clientReferenceId = requiredString(body, "clientReferenceId", 200);
    const cancellationRequestId = requiredString(body, "cancellationRequestId", 200);
    const reason = optionalText(body, "reason", 500);
    const lifecycle = await reservePaymentCancellationIntent(clientReferenceId, cancellationRequestId, reason);
    if (lifecycle.providerPaymentAbsent === true) {
        const occurredAt = requiredString(lifecycle, "requestedAt", 100);
        return json({
            cancellationRequestId,
            providerStatus: "absent",
            providerPaymentAbsent: true,
            providerEventId: `payment-cancellation-absent:${cancellationRequestId}`,
            occurredAt,
        });
    }
    const paymentId = requiredInteger(lifecycle, "paymentId");
    const context = await reservePaymentCancellationOperation(paymentId, clientReferenceId, {
        businessKey: `payment-cancellation:${paymentId}:${cancellationRequestId}`,
        request: { clientReferenceId, cancellationRequestId, reason },
    });
    if (context.payment.client_reference_id !== clientReferenceId) {
        throw new HttpError(409, "payment cancellation lifecycle guard does not match provider payment truth");
    }
    const { operation, payment } = context;
    try {
        const result = await executePaymentIntentCancellation(payment, operation, "system", cancellationRequestId);
        const projectedPayment = result.payment;
        if (!isRecord(projectedPayment)) {
            throw new HttpError(502, "provider cancellation omitted payment truth");
        }
        return json({
            ...result,
            providerPaymentAbsent: false,
            providerEventId: `payment-cancellation:${operation.id}:${projectedPayment.updatedAt}`,
            paymentStatus: projectedPayment.paymentStatus,
            providerPaymentId: projectedPayment.paymentId,
            providerPaymentIntentId: projectedPayment.stripePaymentIntentId,
            providerChargeId: projectedPayment.stripeChargeId,
            amount: projectedPayment.amountTotal,
            currency: projectedPayment.currency,
            financialTermsHash: projectedPayment.financialTermsHash,
            occurredAt: projectedPayment.updatedAt,
            providerSnapshot: projectedPayment,
        });
    } catch (error) {
        await updateFinancialOperation(operation.id, {
            status: "failed",
            last_error: errorMessage(error),
            next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        }).catch(() => null);
        throw error;
    }
}
