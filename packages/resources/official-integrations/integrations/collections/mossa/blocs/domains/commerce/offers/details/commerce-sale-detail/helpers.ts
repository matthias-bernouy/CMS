export const saleStatusDefaults = {
    placed: "To process",
    awaiting_quote: "Delivery to complete",
    awaiting_payment: "Payment pending",
    active: "To ship",
    seller_handoff_declared: "Handoff declared",
    carrier_accepted: "Accepted by carrier",
    in_transit: "In transit",
    arrived_at_pickup_point: "Arrived at pickup point",
    available_for_pickup: "Available at pickup point",
    collected_by_recipient: "Delivered",
    incident: "Delivery incident",
    lost: "Parcel lost",
    pickup_expired: "Pickup expired",
    returning_to_sender: "Return in progress",
    returned_to_sender: "Returned to seller",
    manual_review: "Review required",
    cancellation_pending: "Cancellation in progress",
    expired: "Expired",
    completed: "Completed",
    cancelled: "Cancelled",
    archived: "Archived",
};

export function salePresentationStatus(order) {
    const orderStatus = String(order?.status || "unknown");
    if (orderStatus !== "active") {
        return orderStatus;
    }
    const fulfillmentStatus = String(order?.fulfillment?.status || order?.fulfillmentStatus || "");
    return Object.hasOwn(saleStatusDefaults, fulfillmentStatus) && fulfillmentStatus !== "active"
        ? fulfillmentStatus
        : orderStatus;
}

export function formatMoney(amount, currency, locale = "en-US", signDisplay = "auto") {
    const value = Number(amount);
    if (!Number.isSafeInteger(value)) {
        return "—";
    }
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(currency || "USD").toUpperCase(),
            signDisplay,
        }).format(value / 100);
    } catch {
        const sign = signDisplay === "always" && value >= 0 ? "+" : "";
        return `${sign}${(value / 100).toFixed(2)} ${String(currency || "USD").toUpperCase()}`;
    }
}

export function formatDate(value, locale = "en-US") {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

export function variantLabel(snapshot) {
    const options = Array.isArray(snapshot?.options) ? snapshot.options : [];
    if (options.length) {
        return options
            .map((option) => {
                const axis = option.axisLabel || option.axisKey;
                const value = option.valueLabel || option.valueKey;
                return [axis, value].filter(Boolean).join(" : ");
            })
            .filter(Boolean)
            .join(" · ");
    }
    return String(snapshot?.title || "");
}

export function conditionLabel(code) {
    const words = String(code || "")
        .trim()
        .replaceAll(/[_-]+/g, " ");
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

export function shippingAmount(order) {
    const snapshot = order?.financialTerms?.shippingAmount;
    if (Number.isSafeInteger(snapshot) && snapshot >= 0) {
        return snapshot;
    }
    const explicit = Number(order?.shippingAmount);
    if (Number.isSafeInteger(explicit) && explicit >= 0) {
        return explicit;
    }
    return NaN;
}

export function sellerProceedsAmount(order) {
    return financialAmount(order, "sellerProceedsAmount");
}

export function sellerMerchandiseAmount(order) {
    const amount = financialAmount(order, "merchandiseSubtotalAmount");
    if (Number.isSafeInteger(amount)) {
        return amount;
    }
    const fallback = Number(order?.subtotalAmount);
    return Number.isSafeInteger(fallback) && fallback >= 0 ? fallback : NaN;
}

export function sellerCommissionAmount(order) {
    return financialAmount(order, "sellerCommissionAmount");
}

export function platformShippingShareAmount(order) {
    return financialAmount(order, "platformShippingShareAmount");
}

export function sellerShippingShareAmount(order) {
    return financialAmount(order, "sellerShippingShareAmount");
}

function financialAmount(order, field) {
    const value = order?.financialTerms?.[field];
    return Number.isSafeInteger(value) && value >= 0 ? value : NaN;
}

export function errorMessage(error, fallback) {
    const message = error instanceof Error ? error.message : String(error || "");
    return /cms|api key/i.test(message) ? fallback : message || fallback;
}
