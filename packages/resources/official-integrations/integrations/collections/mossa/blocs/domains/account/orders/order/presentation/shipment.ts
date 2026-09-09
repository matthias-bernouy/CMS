import type { CopyReader, PaymentState, ShipmentPresentation } from "./status";
import type { ObjectValue } from "./value";

export function shipmentPresentation(payment: PaymentState, shipment: unknown, copy: CopyReader): ShipmentPresentation {
    const paymentCopy = paymentShipmentPresentation(payment, copy);
    if (paymentCopy) {
        return paymentCopy;
    }
    const values: Record<string, [string, string, number]> = {
        delivered: ["state-parcel-delivered", "shipment-delivered-description", 3],
        in_transit: ["state-parcel-in-transit", "shipment-in-transit-description", 2],
        incident: ["state-delivery-incident-reported", "shipment-incident-description", 2],
        failed: ["state-shipment-to-complete", "shipment-failed-description", 1],
        unknown: ["state-shipment-status-to-be-confirmed", "shipment-unknown-description", 1],
        cancelled: ["state-shipment-cancelled", "shipment-cancelled-description", 1],
        created: ["state-shipment-being-prepared", "shipment-created-description", 1],
        label_ready: ["state-shipment-being-prepared", "shipment-created-description", 1],
        creating: ["state-shipment-being-prepared", "shipment-created-description", 1],
    };
    const [title, description, stage] = values[String(shipment)] || [
        "state-order-being-prepared",
        "shipment-preparing-description",
        1,
    ];
    return { title: copy(title), description: copy(description), stage };
}

export function progressSteps(
    stage: number,
    confirmed: boolean,
    copy: CopyReader,
    progressTone = "primary",
): Array<Record<string, string>> {
    const labels = [
        "progress-confirmed-label",
        "progress-prepared-label",
        "progress-shipped-label",
        "progress-pickup-label",
    ];
    return labels.map((key, index) => {
        const state = !confirmed ? "upcoming" : index < stage ? "complete" : index === stage ? "current" : "upcoming";
        return {
            current: String(state === "current"),
            label: copy(key),
            number: String(index + 1),
            tone: state === "upcoming" ? "info" : progressTone,
            variant: state === "upcoming" ? "ghost" : "filled",
        };
    });
}

export function relayPresentation(
    relay: ObjectValue | null,
    shipment: ObjectValue | null,
    copy: CopyReader,
): { label: string; tone: string } {
    const selected = String(relay?.relayLocation || relay?.location || "");
    const shipped = String(shipment?.deliveryRelayLocation || "");
    if (selected && shipped && selected !== shipped) {
        return { label: copy("relay-mismatch-label"), tone: "danger" };
    }
    if (selected && selected === shipped) {
        return { label: copy("relay-confirmed-label"), tone: "success" };
    }
    return {
        label: copy(shipped ? "relay-confirmation-pending-label" : "relay-selected-label"),
        tone: "info",
    };
}

function paymentShipmentPresentation(payment: PaymentState, copy: CopyReader): ShipmentPresentation | null {
    if (payment === "processing") {
        return item(copy, "state-payment-confirmation-in-progress", "shipment-payment-pending-description");
    }
    if (payment === "manual_review" || payment === "disputed" || payment === "failed") {
        return item(copy, "state-payment-under-review", "shipment-payment-review-description");
    }
    if (payment === "cancelled") {
        return item(copy, "state-payment-cancelled", "shipment-payment-cancelled-description");
    }
    if (payment === "refunded" || payment === "partially_refunded") {
        return item(copy, "state-order-refunded", "shipment-refunded-description");
    }
    if (payment === "unknown") {
        return item(copy, "shipment-unavailable-title", "shipment-unavailable-description");
    }
    if (payment !== "succeeded") {
        return item(copy, "state-waiting-for-payment", "shipment-payment-pending-description");
    }
    return null;
}

function item(copy: CopyReader, title: string, description: string): ShipmentPresentation {
    return { title: copy(title), description: copy(description), stage: 0 };
}
