import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { booleanValue, camelize, integer, isRecord, readJsonObject, requiredText, text } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";

export async function lockOrderFinancialTerms(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("lock_order_financial_terms", {
        p_public_id: requiredText(body.orderPublicId, "orderPublicId"),
        p_buyer_cms_user_id: cmsUserId(request),
        p_delivery_quote_id: requiredText(body.deliveryQuoteId, "deliveryQuoteId"),
        p_shipping_amount: integer(body.shippingAmount, "shippingAmount", true),
        p_currency: requiredText(body.currency, "currency").toLowerCase(),
        p_expected_version: integer(body.expectedVersion, "expectedVersion", true),
        p_actor_id: text(body.actorId) ?? "commerce-delivery",
    });
    return json(camelize(result));
}

export async function getOrderDeliveryQuoteAuthorization(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const result = await rpc("get_order_delivery_quote_authorization", {
        p_public_id: requiredText(url.searchParams.get("orderPublicId"), "orderPublicId"),
        p_buyer_cms_user_id: cmsUserId(request),
    });
    return json(camelize(result));
}

export async function prepareProtectedPayment(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("prepare_protected_payment", {
        p_order_id: integer(body.orderId, "orderId", true),
        p_buyer_cms_user_id: cmsUserId(request),
    });
    return json(camelize(result));
}

export async function refreshPlatformPayoutLiability(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("refresh_platform_payout_liability", {
        p_calculation_reason: text(body.reason) ?? "Scheduled platform liability and risk-window refresh",
        p_included_prospective_order_id: null,
    });
    return json(camelize(result));
}

export async function pendingPlatformPayoutLiabilityAuthorizations(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("pending_platform_payout_liability_authorizations", {
        p_run_key: requiredText(body.runKey, "runKey"),
    });
    return json(camelize(result));
}

export async function authorizePlatformPayoutLiabilityDecrease(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("authorize_platform_payout_liability_decrease", {
        p_expected_liability_revision: integer(body.expectedLiabilityRevision, "expectedLiabilityRevision", true),
        p_actor_id: cmsUserId(request),
        p_reason: requiredText(body.reason, "reason"),
    });
    return json(camelize(result));
}

export async function recordPlatformPayoutLiabilityApplied(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("record_platform_payout_liability_applied", {
        p_liability_revision: integer(body.liabilityRevision, "liabilityRevision", true),
        p_applied_minimum_amount: integer(body.appliedMinimumAmount, "appliedMinimumAmount", true),
        p_decrease_authorization_id: text(body.decreaseAuthorizationId) ?? null,
    });
    return json(camelize(result));
}

export async function recordOrderPayment(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const snapshot = optionalObject(body.providerSnapshot, "providerSnapshot");
    if (booleanValue(body.providerPaymentAbsent, "providerPaymentAbsent") === true) {
        const result = await rpc("record_absent_order_payment_cancellation", {
            p_order_public_id: requiredText(body.orderPublicId, "orderPublicId"),
            p_provider_event_id: requiredText(body.providerEventId, "providerEventId"),
            p_cancellation_request_id: requiredText(body.cancellationRequestId, "cancellationRequestId"),
            p_occurred_at: requiredText(body.occurredAt, "occurredAt"),
            p_provider_snapshot: snapshot,
        });
        return json(camelize(result));
    }
    const result = await rpc("record_order_payment_projection", {
        p_order_public_id: requiredText(body.orderPublicId, "orderPublicId"),
        p_provider_event_id: requiredText(body.providerEventId, "providerEventId"),
        p_provider_payment_id: integer(body.providerPaymentId, "providerPaymentId", true),
        p_status: requiredText(body.status, "status"),
        p_amount: integer(body.amount, "amount", true),
        p_currency: requiredText(body.currency, "currency").toLowerCase(),
        p_financial_terms_hash: requiredText(body.financialTermsHash, "financialTermsHash"),
        p_occurred_at: requiredText(body.occurredAt, "occurredAt"),
        p_provider_snapshot: snapshot,
        p_provider_charge_id: text(body.providerChargeId) ?? null,
        p_provider_payment_intent_id: text(body.providerPaymentIntentId) ?? null,
    });
    return json(camelize(result));
}

export async function recordOrderSettlement(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("record_order_settlement_projection", {
        p_order_public_id: requiredText(body.orderPublicId, "orderPublicId"),
        p_provider_event_id: requiredText(body.providerEventId, "providerEventId"),
        p_operation_type: requiredText(body.operationType, "operationType"),
        p_provider_operation_id: integer(body.providerOperationId, "providerOperationId", true),
        p_status: requiredText(body.status, "status"),
        p_amount: integer(body.amount, "amount", true),
        p_currency: requiredText(body.currency, "currency").toLowerCase(),
        p_occurred_at: requiredText(body.occurredAt, "occurredAt"),
        p_release_authorization_id: text(body.releaseAuthorizationId) ?? null,
        p_refund_request_id: integer(body.commerceRefundRequestId, "commerceRefundRequestId") ?? null,
        p_refund_business_key: text(body.refundRequestId) ?? null,
        p_provider_snapshot: optionalObject(body.providerSnapshot, "providerSnapshot"),
    });
    return json(camelize(result));
}

export async function recordOrderStripeDispute(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("record_order_stripe_dispute_projection", {
        p_order_public_id: requiredText(body.orderPublicId, "orderPublicId"),
        p_provider_event_id: requiredText(body.providerEventId, "providerEventId"),
        p_provider_dispute_id: requiredText(body.providerDisputeId, "providerDisputeId"),
        p_status: requiredText(body.status, "status"),
        p_reason: text(body.reason) ?? null,
        p_amount: integer(body.amount, "amount", true),
        p_currency: requiredText(body.currency, "currency").toLowerCase(),
        p_opened_at: requiredText(body.openedAt, "openedAt"),
        p_occurred_at: requiredText(body.occurredAt, "occurredAt"),
        p_evidence_due_by: text(body.evidenceDueBy) ?? null,
        p_provider_snapshot: optionalObject(body.providerSnapshot, "providerSnapshot"),
    });
    return json(camelize(result));
}

function optionalObject(value: unknown, name: string): Record<string, unknown> {
    if (value === undefined || value === null) {
        return {};
    }
    if (!isRecord(value)) {
        throw new HttpError(400, `${name} must be an object`);
    }
    return value;
}
