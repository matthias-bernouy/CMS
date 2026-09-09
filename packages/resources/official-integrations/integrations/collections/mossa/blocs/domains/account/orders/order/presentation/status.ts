import { minorAmount, objectValue, type ObjectValue } from "./value";

export type CopyReader = (name: string, values?: Record<string, string>) => string;
export type PaymentState =
    | "missing"
    | "created"
    | "requires_action"
    | "processing"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "manual_review"
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
    if (settlement === "refunded" || (amountTotal !== null && amountTotal > 0 && refundedAmount === amountTotal)) {
        return "refunded";
    }
    if (refundedAmount !== null && refundedAmount > 0) {
        return "partially_refunded";
    }
    if (payment?.manualReviewReason || settlement === "manual_review") {
        return "manual_review";
    }
    if (["open", "under_review", "lost"].includes(dispute)) {
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
    return ["created", "requires_action", "processing", "succeeded", "failed", "cancelled", "manual_review"].includes(
        raw,
    )
        ? (raw as PaymentState)
        : "unknown";
}

export function paymentPresentation(state: PaymentState, copy: CopyReader): BadgePresentation {
    const values: Record<PaymentState, [string, string]> = {
        missing: ["state-payment-not-started", "warning"],
        created: ["state-payment-pending", "warning"],
        requires_action: ["state-payment-to-complete", "warning"],
        processing: ["state-payment-confirmation-in-progress", "warning"],
        succeeded: ["state-payment-confirmed", "success"],
        failed: ["state-payment-failed", "danger"],
        cancelled: ["state-payment-cancelled", "danger"],
        manual_review: ["state-payment-under-review", "info"],
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
        in_transit: ["state-in-delivery", "primary"],
        incident: ["state-delivery-incident", "danger"],
        failed: ["state-shipment-to-complete", "danger"],
        unknown: ["state-tracking-to-be-confirmed", "primary"],
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
    return ["missing", "created", "requires_action"].includes(payment)
        ? badge(copy, "state-payment-pending", "primary")
        : badge(copy, "state-status-unavailable", "info");
}

function badge(copy: CopyReader, key: string, tone: string): BadgePresentation {
    return { label: copy(key), tone };
}
