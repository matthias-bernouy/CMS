import { minorAmount, objectValue, type ObjectValue } from "./value";

export type CopyReader = (name: string, values?: Record<string, string>) => string;
export type PaymentState =
    | "missing"
    | "created"
    | "requires_action"
    | "requires_payment_method"
    | "processing"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "manual_review"
    | "refund_pending"
    | "refunded"
    | "partially_refunded"
    | "disputed"
    | "unknown";

type BadgePresentation = { label: string; tone: string };
export type ShipmentPresentation = { title: string; description: string; stage: number };

export function normalizedPaymentState(payment: ObjectValue | null, order: ObjectValue): PaymentState {
    const operation = objectValue(order.operation);
    const settlement = String(payment?.settlementStatus ?? operation?.settlementStatus ?? "").toLowerCase();
    const dispute = String(payment?.disputeStatus ?? "").toLowerCase();
    const amountTotal = minorAmount(payment?.amountTotal);
    const refundedAmount = minorAmount(payment?.refundedAmount);
    if (
        ["refunded", "reversed"].includes(settlement) ||
        (amountTotal !== null && amountTotal > 0 && refundedAmount === amountTotal)
    ) {
        return "refunded";
    }
    if (refundedAmount !== null && refundedAmount > 0) {
        return "partially_refunded";
    }
    if (["refund_pending", "reversal_pending"].includes(settlement)) {
        return "refund_pending";
    }
    if (payment?.manualReviewReason || ["manual_review", "blocked"].includes(settlement)) {
        return "manual_review";
    }
    if (
        [
            "warning_needs_response",
            "warning_under_review",
            "needs_response",
            "under_review",
            "lost",
            "manual_review",
        ].includes(dispute)
    ) {
        return "disputed";
    }
    const raw = String(payment?.paymentStatus ?? payment?.status ?? operation?.paymentStatus ?? "").toLowerCase();
    if (!raw) {
        return "missing";
    }
    if (raw === "paid") {
        return "succeeded";
    }
    if (raw === "canceled") {
        return "cancelled";
    }
    return [
        "created",
        "requires_action",
        "requires_payment_method",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
        "manual_review",
    ].includes(raw)
        ? (raw as PaymentState)
        : "unknown";
}

export function paymentPresentation(state: PaymentState, copy: CopyReader): BadgePresentation {
    const values: Record<PaymentState, [string, string]> = {
        missing: ["state-payment-not-started", "warning"],
        created: ["state-payment-pending", "warning"],
        requires_action: ["state-payment-to-complete", "warning"],
        requires_payment_method: ["state-payment-to-complete", "warning"],
        processing: ["state-payment-confirmation-in-progress", "warning"],
        succeeded: ["state-payment-confirmed", "success"],
        failed: ["state-payment-failed", "danger"],
        cancelled: ["state-payment-cancelled", "danger"],
        manual_review: ["state-payment-under-review", "info"],
        refund_pending: ["state-payment-refund-in-progress", "info"],
        refunded: ["state-payment-refunded", "info"],
        partially_refunded: ["state-payment-partially-refunded", "info"],
        disputed: ["state-payment-disputed", "info"],
        unknown: ["state-payment-status-unavailable", "info"],
    };
    const [key, tone] = values[state];
    return { label: copy(key), tone };
}

export function orderPresentation(
    status: unknown,
    payment: PaymentState,
    shipment: unknown,
    copy: CopyReader,
): BadgePresentation {
    if (status === "cancelled") {
        return badge(copy, "state-cancelled", "danger");
    }
    if (status === "cancellation_pending") {
        return badge(copy, "state-cancellation-in-progress", "primary");
    }
    if (status === "expired") {
        return badge(copy, "state-expired", "info");
    }
    if (status === "completed") {
        return badge(copy, "state-completed", "success");
    }
    if (status === "awaiting_quote") {
        return badge(copy, "state-delivery-to-complete", "primary");
    }
    if (status === "awaiting_payment") {
        return awaitingPaymentPresentation(payment, copy);
    }
    if (status !== "active") {
        return badge(copy, "state-status-unavailable", "info");
    }
    const shipmentValues: Record<string, [string, string]> = {
        delivered: ["state-delivered", "success"],
        collected_by_recipient: ["state-delivered", "success"],
        available_for_pickup: ["state-ready-for-pickup", "success"],
        arrived_at_pickup_point: ["state-ready-for-pickup", "success"],
        carrier_accepted: ["state-in-delivery", "primary"],
        in_transit: ["state-in-delivery", "primary"],
        incident: ["state-delivery-incident", "danger"],
        lost: ["state-parcel-lost", "danger"],
        pickup_expired: ["state-pickup-expired", "danger"],
        returning_to_sender: ["state-returning-to-sender", "primary"],
        returned_to_sender: ["state-returned-to-sender", "info"],
        failed: ["state-shipment-to-complete", "danger"],
        unknown: ["state-tracking-to-be-confirmed", "primary"],
        manual_review: ["state-order-under-review", "danger"],
        awaiting_shipment: ["state-order-being-prepared", "primary"],
        shipment_creating: ["state-order-being-prepared", "primary"],
        label_created: ["state-order-being-prepared", "primary"],
        seller_handoff_declared: ["state-handoff-declared", "primary"],
        cancelled: ["state-shipment-to-complete", "danger"],
        creating: ["state-order-being-prepared", "primary"],
        created: ["state-order-being-prepared", "primary"],
        label_ready: ["state-order-being-prepared", "primary"],
    };
    const knownShipment = shipmentValues[String(shipment)];
    if (knownShipment) {
        return badge(copy, ...knownShipment);
    }
    return payment === "succeeded"
        ? badge(copy, "state-order-confirmed", "success")
        : badge(copy, payment === "unknown" ? "state-status-unavailable" : "state-order-under-review", "primary");
}

function awaitingPaymentPresentation(payment: PaymentState, copy: CopyReader): BadgePresentation {
    if (payment === "processing") {
        return badge(copy, "state-payment-in-progress", "primary");
    }
    if (payment === "manual_review" || payment === "disputed") {
        return badge(copy, "state-payment-under-review", "primary");
    }
    if (payment === "failed" || payment === "cancelled") {
        return badge(copy, payment === "failed" ? "state-payment-failed" : "state-payment-cancelled", "danger");
    }
    return ["missing", "created", "requires_action", "requires_payment_method"].includes(payment)
        ? badge(copy, "state-payment-pending", "primary")
        : badge(copy, "state-status-unavailable", "info");
}

function badge(copy: CopyReader, key: string, tone: string): BadgePresentation {
    return { label: copy(key), tone };
}
