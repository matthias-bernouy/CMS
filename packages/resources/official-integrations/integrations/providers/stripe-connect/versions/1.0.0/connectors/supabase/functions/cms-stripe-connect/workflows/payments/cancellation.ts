import { getRowByField } from "../../db/postgrest.ts";
import { insertPaymentEvent } from "../../db/repositories/events-exceptions.ts";
import { updateFinancialOperation } from "../../db/repositories/financial-operations.ts";
import type { FinancialOperationRow } from "../../db/records/operations.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { publicPayment } from "../../domain/payments/presentation.ts";
import {
    cancelStripePaymentIntent,
    createStripePaymentIntent,
    retrievePaymentIntent,
} from "../../provider/payments.ts";
import type { ProviderTruthActorKind, StripePaymentIntent } from "../../provider/types.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { requiredOperationString } from "../operations/request-values.ts";
import { applyPaymentIntent } from "./projection.ts";

type PaymentIntentCreationOperation = Pick<FinancialOperationRow, "id" | "stripe_object_id" | "created_at">;

const paymentIntentCreationOperationSelect = "id,stripe_object_id,created_at";

export async function executePaymentIntentCancellation(
    payment: ConnectPaymentRow,
    operation: FinancialOperationRow,
    actorKind: ProviderTruthActorKind,
    actorId: string,
): Promise<JsonRecord> {
    await updateFinancialOperation(operation.id, {
        status: "processing",
        claimed_at: new Date().toISOString(),
        attempt_count: operation.attempt_count + 1,
    });
    let intent = await paymentIntentForCancellation(payment, operation);
    payment = await applyPaymentIntent(payment, intent, { actorKind, actorId });
    if (intent.status !== "canceled" && intent.status !== "succeeded") {
        intent = await cancelStripePaymentIntent(intent.id);
        payment = await applyPaymentIntent(payment, intent, { actorKind, actorId });
    }
    if (intent.status !== "canceled" && intent.status !== "succeeded") {
        throw new Error(`Stripe PaymentIntent cancellation remains non-terminal: ${intent.status}`);
    }
    await updateFinancialOperation(operation.id, {
        status: "succeeded",
        stripe_object_id: intent.id,
        response: intent,
        last_error: null,
        next_attempt_at: null,
        completed_at: new Date().toISOString(),
    });
    await insertPaymentEvent(
        payment.id,
        intent.status === "canceled"
            ? "payment_intent_cancellation_confirmed"
            : "payment_intent_cancellation_found_late_success",
        actorKind,
        actorId,
        { operationId: operation.id, paymentIntentId: intent.id },
    );
    return {
        cancellationRequestId: requiredOperationString(operation, "cancellationRequestId"),
        providerOperationId: operation.id,
        providerStatus: intent.status,
        payment: publicPayment(payment),
    };
}

async function paymentIntentForCancellation(
    payment: ConnectPaymentRow,
    cancellationOperation: FinancialOperationRow,
): Promise<StripePaymentIntent> {
    if (cancellationOperation.stripe_object_id) {
        return await retrievePaymentIntent(cancellationOperation.stripe_object_id);
    }
    if (payment.stripe_payment_intent_id) {
        return await retrievePaymentIntent(payment.stripe_payment_intent_id);
    }
    const createOperation = await getRowByField<PaymentIntentCreationOperation>(
        "financial_operations",
        "business_key",
        `payment:${payment.id}:${payment.financial_terms_hash}`,
        paymentIntentCreationOperationSelect,
    );
    if (!createOperation) {
        throw new Error("PaymentIntent creation has not been durably reserved yet");
    }
    if (createOperation.stripe_object_id) {
        return await retrievePaymentIntent(createOperation.stripe_object_id);
    }
    const age = Date.now() - Date.parse(createOperation.created_at);
    if (!Number.isFinite(age) || age >= 23 * 60 * 60 * 1000) {
        throw new Error("PaymentIntent cancellation recovery exceeded the Stripe idempotency safety window");
    }
    const intent = await createStripePaymentIntent(payment);
    const applied = await applyPaymentIntent(payment, intent, {
        expectedPaymentIntentId: intent.id,
        actorKind: "reconciliation",
        actorId: "payment-cancellation-create-recovery",
    });
    await updateFinancialOperation(createOperation.id, {
        status: applied.settlement_status === "manual_review" ? "manual_review" : "succeeded",
        stripe_object_id: intent.id,
        response: intent,
        last_error: applied.settlement_status === "manual_review" ? applied.manual_review_reason : null,
        completed_at: new Date().toISOString(),
    });
    return intent;
}
