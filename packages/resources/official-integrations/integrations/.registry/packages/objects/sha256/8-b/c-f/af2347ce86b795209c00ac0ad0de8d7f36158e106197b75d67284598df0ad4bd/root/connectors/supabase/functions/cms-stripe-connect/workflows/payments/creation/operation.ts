import { reserveFinancialOperation, updateFinancialOperation } from "../../../db/repositories/financial-operations.ts";
import type { ConnectPaymentRow } from "../../../db/records/payments.ts";
import { publicPaymentWithClientSecret } from "../../../domain/payments/presentation.ts";
import { createStripePaymentIntent, retrievePaymentIntent } from "../../../provider/payments.ts";
import { errorMessage } from "../../../shared/data.ts";
import type { JsonRecord } from "../../../shared/types.ts";
import { applyPaymentIntent } from "../projection.ts";

type ProtectedPaymentOperationTerms = {
    amountTotal: number;
    currency: string;
    clientReferenceId: string;
    financialTermsHash: string;
    transferGroup: string;
};

export async function executeProtectedPaymentIntentCreation(
    payment: ConnectPaymentRow,
    terms: ProtectedPaymentOperationTerms,
): Promise<JsonRecord> {
    const operation = await reserveFinancialOperation(payment.id, {
        businessKey: `payment:${payment.id}:${terms.financialTermsHash}`,
        operationType: "payment_intent_create",
        request: {
            amount: terms.amountTotal,
            currency: terms.currency,
            clientReferenceId: terms.clientReferenceId,
            financialTermsHash: terms.financialTermsHash,
            transferGroup: terms.transferGroup,
        },
    });

    try {
        if (operation.status === "succeeded" && operation.stripe_object_id) {
            const intent = await retrievePaymentIntent(operation.stripe_object_id);
            payment = await applyPaymentIntent(payment, intent, {
                actorKind: "system",
                actorId: "payment-operation-replay",
            });
            return publicPaymentWithClientSecret(payment, intent.client_secret ?? "");
        }
        await updateFinancialOperation(operation.id, {
            status: "processing",
            claimed_at: new Date().toISOString(),
            attempt_count: operation.attempt_count + 1,
        });
        const paymentIntent = await createStripePaymentIntent(payment);
        payment = await applyPaymentIntent(payment, paymentIntent, {
            expectedPaymentIntentId: paymentIntent.id,
            actorKind: "system",
            actorId: "payment-intent-create",
        });
        await updateFinancialOperation(operation.id, {
            status: payment.settlement_status === "manual_review" ? "manual_review" : "succeeded",
            stripe_object_id: paymentIntent.id,
            response: paymentIntent,
            last_error: payment.settlement_status === "manual_review" ? payment.manual_review_reason : null,
            completed_at: new Date().toISOString(),
        });
        return publicPaymentWithClientSecret(payment, paymentIntent.client_secret ?? "");
    } catch (error) {
        await updateFinancialOperation(operation.id, {
            status: "failed",
            last_error: errorMessage(error),
            next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        }).catch(() => null);
        throw error;
    }
}
