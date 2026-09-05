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

export function statusLabel(value) {
    return (
        {
            creating: "Creation in progress",
            created: "Shipment created",
            label_ready: "Shipping label ready",
            carrier_accepted: "Accepted by carrier",
            in_transit: "In transit",
            arrived_at_pickup_point: "Arrived at pickup point",
            available_for_pickup: "Available at pickup point",
            collected_by_recipient: "Collected by recipient",
            incident: "Delivery incident",
            lost: "Parcel lost",
            pickup_expired: "Pickup window expired",
            returning_to_sender: "Returning to sender",
            returned_to_sender: "Returned to sender",
            cancelled: "Cancelled",
            failed: "Creation failed",
            unknown: "Review required",
        }[value] || "Ready to prepare"
    );
}

export function statusCopy(value) {
    if (value === "in_transit") {
        return "The parcel is in transit.";
    }
    if (value === "arrived_at_pickup_point") {
        return "The parcel arrived at the pickup point but has not been collected.";
    }
    if (value === "available_for_pickup") {
        return "The parcel is available at the pickup point.";
    }
    if (value === "collected_by_recipient") {
        return "The carrier confirmed collection by the recipient.";
    }
    if (value === "failed") {
        return "Shipment creation failed and can be retried.";
    }
    if (value === "unknown") {
        return "The shipment must be reviewed before another attempt.";
    }
    return value ? "The shipping label is available." : "Create the shipping label when the parcel is ready.";
}

export function errorMessage(error) {
    return "The delivery service is temporarily unavailable. Try again shortly.";
}

export function publicEventLabel(value, status) {
    const label = String(value || "").trim();
    return label || statusCopy(status);
}

export function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function headers(value) {
    return value ? Object.fromEntries(new Headers(value).entries()) : {};
}
