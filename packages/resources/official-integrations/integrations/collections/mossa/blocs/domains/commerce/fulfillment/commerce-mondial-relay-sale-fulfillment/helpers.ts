export function safeHttpUrl(value) {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
        return "";
    }
}

export function safeCmsLabelUrl(value) {
    try {
        const url = new URL(String(value || ""), location.origin);
        return url.origin === location.origin && url.pathname.startsWith("/.cms/sources/") ? url.toString() : "";
    } catch {
        return "";
    }
}

export function statusLabel(value, text = (_name, fallback) => fallback) {
    return (
        {
            creating: text("status-creating-label", "Creation in progress"),
            created: text("status-created-label", "Shipment created"),
            label_ready: text("status-label-ready-label", "Shipping label ready"),
            carrier_accepted: text("status-carrier-accepted-label", "Accepted by carrier"),
            in_transit: text("status-in-transit-label", "In transit"),
            arrived_at_pickup_point: text("status-arrived-at-pickup-point-label", "Arrived at pickup point"),
            available_for_pickup: text("status-available-for-pickup-label", "Available at pickup point"),
            collected_by_recipient: text("status-collected-by-recipient-label", "Collected by recipient"),
            incident: text("status-incident-label", "Delivery incident"),
            lost: text("status-lost-label", "Parcel lost"),
            pickup_expired: text("status-pickup-expired-label", "Pickup window expired"),
            returning_to_sender: text("status-returning-to-sender-label", "Returning to sender"),
            returned_to_sender: text("status-returned-to-sender-label", "Returned to sender"),
            cancelled: text("status-cancelled-label", "Cancelled"),
            failed: text("status-failed-label", "Creation failed"),
            unknown: text("status-unknown-label", "Review required"),
        }[value] || text("status-ready-label", "Ready to prepare")
    );
}

export function statusCopy(value, text = (_name, fallback) => fallback) {
    if (value === "in_transit") {
        return text("status-in-transit-message", "The parcel is in transit.");
    }
    if (value === "arrived_at_pickup_point") {
        return text(
            "status-arrived-at-pickup-point-message",
            "The parcel arrived at the pickup point but has not been collected.",
        );
    }
    if (value === "available_for_pickup") {
        return text("status-available-for-pickup-message", "The parcel is available at the pickup point.");
    }
    if (value === "collected_by_recipient") {
        return text("status-collected-by-recipient-message", "The carrier confirmed collection by the recipient.");
    }
    if (value === "failed") {
        return text("status-failed-message", "Shipment creation failed and can be retried.");
    }
    if (value === "unknown") {
        return text("status-unknown-message", "The shipment must be reviewed before another attempt.");
    }
    return value
        ? text("status-ready-message", "The shipping label is available.")
        : text("status-missing-message", "Create the shipping label when the parcel is ready.");
}

export function errorMessage(error) {
    return "The delivery service is temporarily unavailable. Try again shortly.";
}

export function publicEventLabel(value, status, text = (_name, fallback) => fallback) {
    const label = String(value || "").trim();
    return label || statusCopy(status, text);
}

export function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function headers(value) {
    return value ? Object.fromEntries(new Headers(value).entries()) : {};
}

export const fulfillmentCopy: Record<string, string> = {
    "loading-label": "Loading shipment",
    "order-label": "Order",
    "status-label": "Status",
    "expedition-label": "Shipment number",
    "sale-label": "Sale",
    "handoff-declared-label": "Handoff declared",
    "carrier-scan-pending-message": "Waiting for the carrier's first scan.",
    "creating-message": "Creating the shipping label…",
    "action-error-message": "The delivery service is temporarily unavailable. Try again shortly.",
    "status-creating-label": "Creation in progress",
    "status-created-label": "Shipment created",
    "status-label-ready-label": "Shipping label ready",
    "status-carrier-accepted-label": "Accepted by carrier",
    "status-in-transit-label": "In transit",
    "status-arrived-at-pickup-point-label": "Arrived at pickup point",
    "status-available-for-pickup-label": "Available at pickup point",
    "status-collected-by-recipient-label": "Collected by recipient",
    "status-incident-label": "Delivery incident",
    "status-lost-label": "Parcel lost",
    "status-pickup-expired-label": "Pickup window expired",
    "status-returning-to-sender-label": "Returning to sender",
    "status-returned-to-sender-label": "Returned to sender",
    "status-cancelled-label": "Cancelled",
    "status-failed-label": "Creation failed",
    "status-unknown-label": "Review required",
    "status-ready-label": "Ready to prepare",
    "status-in-transit-message": "The parcel is in transit.",
    "status-arrived-at-pickup-point-message": "The parcel arrived at the pickup point but has not been collected.",
    "status-available-for-pickup-message": "The parcel is available at the pickup point.",
    "status-collected-by-recipient-message": "The carrier confirmed collection by the recipient.",
    "status-failed-message": "Shipment creation failed and can be retried.",
    "status-unknown-message": "The shipment must be reviewed before another attempt.",
    "status-ready-message": "The shipping label is available.",
    "status-missing-message": "Create the shipping label when the parcel is ready.",
};
