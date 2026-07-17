import { methodNotAllowed } from "../core/http.ts";
import { readJsonObject, requiredText, integer, text } from "../core/records.ts";
import { json } from "../core/http.ts";
import { camelize } from "../core/records.ts";
import { rpc } from "../core/rest.ts";
import { getOrderDeliveryQuoteAuthorization, lockOrderFinancialTerms, pendingPlatformPayoutLiabilityAuthorizations, recordOrderPayment, recordOrderSettlement, recordOrderStripeDispute, recordPlatformPayoutLiabilityApplied, refreshPlatformPayoutLiability } from "../routes/order/financials.ts";
import {
    claimPendingShipmentCancellations,
    claimPendingShipmentCreations,
    completeOrderShipmentCancellation,
    completeOrderShipmentCreation,
    failOrderShipmentCancellation,
    failOrderShipmentCreation,
    getOrderFulfillmentAuthorization,
    getOrderLabelAuthorization,
    recordDeliveryOrderReconciliationHealth,
    recordDeliveryReconciliationHealth,
    recordOrderFulfillment,
    reserveOrderShipmentCreation,
} from "../routes/order/fulfillment.ts";
import { getClaimReturnAuthorization, recordClaimReturnDelivery } from "../routes/order/claims.ts";
import { getOfferNegotiationContext } from "../routes/offer/contexts.ts";
import { verifyPendingSellerPayoutEligibility } from "../routes/sellers.ts";
import { getProtectedCheckoutSellerContext, getProtectedPaymentSellerContext } from "../routes/orders.ts";

export async function handleInternalSettlementRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/system/seller/payout-eligibility") return post(request, verifyPendingSellerPayoutEligibility);
    if (route === "/system/protected-checkout/seller-context") return post(request, getProtectedCheckoutSellerContext);
    if (route === "/system/protected-payment/seller-context") return post(request, getProtectedPaymentSellerContext);
    if (route === "/system/offer/negotiation-context") {
        return request.method === "GET" ? await getOfferNegotiationContext(request) : methodNotAllowed("GET");
    }
    if (route === "/system/order/financial-terms/lock") return post(request, lockOrderFinancialTerms);
    if (route === "/system/order/delivery-quote/authorization") {
        return request.method === "GET" ? await getOrderDeliveryQuoteAuthorization(request) : methodNotAllowed("GET");
    }
    if (route === "/system/order/payment") return post(request, recordOrderPayment);
    if (route === "/system/order/fulfillment") return post(request, recordOrderFulfillment);
    if (route === "/system/order/settlement") return post(request, recordOrderSettlement);
    if (route === "/system/order/stripe-dispute") return post(request, recordOrderStripeDispute);
    if (route === "/system/platform-payout-liability/refresh") return post(request, refreshPlatformPayoutLiability);
    if (route === "/system/platform-payout-liability/pending") return post(request, pendingPlatformPayoutLiabilityAuthorizations);
    if (route === "/system/platform-payout-liability/applied") return post(request, recordPlatformPayoutLiabilityApplied);
    if (route === "/system/claim/return-delivery") return post(request, recordClaimReturnDelivery);
    if (route === "/system/claim/return-authorization") {
        return request.method === "GET" ? await getClaimReturnAuthorization(request) : methodNotAllowed("GET");
    }
    if (route === "/system/order/fulfillment/authorization") {
        return request.method === "GET" ? await getOrderFulfillmentAuthorization(request) : methodNotAllowed("GET");
    }
    if (route === "/system/order/shipment-creation/reserve") return post(request, reserveOrderShipmentCreation);
    if (route === "/system/order/shipment-creations/claim") return post(request, claimPendingShipmentCreations);
    if (route === "/system/order/shipment-creation/complete") return post(request, completeOrderShipmentCreation);
    if (route === "/system/order/shipment-creation/fail") return post(request, failOrderShipmentCreation);
    if (route === "/system/order/label/authorization") {
        return request.method === "GET" ? await getOrderLabelAuthorization(request) : methodNotAllowed("GET");
    }
    if (route === "/system/order/shipment-cancellations/claim") return post(request, claimPendingShipmentCancellations);
    if (route === "/system/order/shipment-cancellation/complete") return post(request, completeOrderShipmentCancellation);
    if (route === "/system/order/shipment-cancellation/fail") return post(request, failOrderShipmentCancellation);
    if (route === "/system/delivery/reconciliation-health") return post(request, recordDeliveryReconciliationHealth);
    if (route === "/system/delivery/order-reconciliation-health") {
        return post(request, recordDeliveryOrderReconciliationHealth);
    }
    if (route === "/system/order/releases/due") {
        return request.method === "POST" ? await authorizeDueOrderReleases(request) : methodNotAllowed("POST");
    }
    if (route === "/system/order/deadlines/due") {
        return request.method === "POST" ? await processDueOrderDeadlines(request) : methodNotAllowed("POST");
    }
    if (route === "/system/order/refunds/pending") {
        return request.method === "POST" ? await pendingOrderRefundAuthorizations(request) : methodNotAllowed("POST");
    }
    if (route === "/system/order/payment-cancellations/pending") {
        return request.method === "POST" ? await pendingPaymentCancellationAuthorizations(request) : methodNotAllowed("POST");
    }
    if (route === "/system/outbox/claim") {
        return request.method === "POST" ? await claimCommerceOutbox(request) : methodNotAllowed("POST");
    }
    if (route === "/system/outbox/complete") {
        return request.method === "POST" ? await completeCommerceOutbox(request) : methodNotAllowed("POST");
    }
    return null;
}

async function authorizeDueOrderReleases(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("authorize_due_order_releases", {
        p_run_key: requiredText(body.runKey, "runKey"),
        p_limit: integer(body.limit, "limit") ?? 25,
    });
    return json(camelize(result));
}

async function processDueOrderDeadlines(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("process_due_order_deadlines", {
        p_run_key: requiredText(body.runKey, "runKey"),
        p_limit: integer(body.limit, "limit") ?? 25,
    });
    return json(camelize(result));
}

async function pendingOrderRefundAuthorizations(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("pending_order_refund_authorizations", {
        p_run_key: requiredText(body.runKey, "runKey"),
        p_limit: integer(body.limit, "limit") ?? 25,
    });
    return json(camelize(result));
}

async function pendingPaymentCancellationAuthorizations(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("pending_payment_cancellation_authorizations", {
        p_run_key: requiredText(body.runKey, "runKey"),
        p_limit: integer(body.limit, "limit") ?? 25,
    });
    return json(camelize(result));
}

async function claimCommerceOutbox(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("claim_outbox_events", {
        p_worker_id: requiredText(body.workerId, "workerId"),
        p_limit: integer(body.limit, "limit") ?? 25,
    });
    return json(camelize({ items: result }));
}

async function completeCommerceOutbox(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("complete_outbox_event", {
        p_event_id: integer(body.eventId, "eventId", true),
        p_worker_id: requiredText(body.workerId, "workerId"),
        p_succeeded: body.succeeded === true,
        p_error: text(body.error) ?? null,
    });
    return json(camelize(result));
}

async function post(request: Request, handler: (request: Request) => Promise<Response>): Promise<Response> {
    return request.method === "POST" ? await handler(request) : methodNotAllowed("POST");
}
