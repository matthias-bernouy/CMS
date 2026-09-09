import { fulfillmentCopy, publicEventLabel, safeHttpUrl, statusLabel } from "./helpers";

type Value = Record<string, unknown>;

export const presentationAttributes = [
    ...Object.keys(fulfillmentCopy),
    "title",
    "copy",
    "create-label",
    "retry-label",
    "label-label",
    "redownload-label",
    "handoff-label",
    "tracking-label",
    "card-density",
    "show-order-reference",
];

export function fulfillmentPresentation(host: HTMLElement, value: unknown): Record<string, unknown> {
    const result = record(value) || {};
    const actions = record(result.actions) || {};
    const shipments = Array.isArray(result.shipments) ? result.shipments : [];
    const shipment = record(shipments[0]);
    const status = String(shipment?.status || "");
    const handoffDeclared = Boolean(shipment?.sellerHandoffDeclaredAt);
    const carrierAccepted = Boolean(shipment?.carrierAcceptedAt);
    const awaitingCarrierScan = status === "label_ready" && handoffDeclared && !carrierAccepted;
    const requiresReview = actions.requiresReview === true;
    const text = (name: string, fallback: string): string => host.getAttribute(name)?.trim() || fallback;

    return {
        actionErrorMessage: text("action-error-message", fulfillmentCopy["action-error-message"]),
        canCreate: actions.canCreateShipment === true && (!shipment || status === "failed"),
        canDeclareHandoff: actions.canDeclareHandoff === true,
        canDownloadLabel: actions.canDownloadLabel === true,
        cardDensity: text("card-density", "regular"),
        copy: text("copy", "Prepare the label, then track the parcel."),
        createLabel: text(
            status === "failed" ? "retry-label" : "create-label",
            status === "failed" ? "Try again" : "Create shipping label",
        ),
        expeditionLabel: text("expedition-label", fulfillmentCopy["expedition-label"]),
        expeditionNumber: String(shipment?.expeditionNumber || "—"),
        errorMessage: text("error-message", "The delivery service is temporarily unavailable. Try again shortly."),
        errorTitle: text("error-title", "Shipment unavailable"),
        handoffLabel: text("handoff-label", "I handed off the parcel"),
        labelLabel: text(
            handoffDeclared ? "redownload-label" : "label-label",
            handoffDeclared ? "Download label again" : "Download label",
        ),
        latestEventLabel: awaitingCarrierScan
            ? text("carrier-scan-pending-message", fulfillmentCopy["carrier-scan-pending-message"])
            : publicEventLabel(shipment?.latestEventLabel, status, text),
        orderLabel: text("order-label", fulfillmentCopy["order-label"]),
        orderReference: String(
            result.orderNumber || result.orderPublicId || text("sale-label", fulfillmentCopy["sale-label"]),
        ),
        requiresReview,
        reviewMessage: text("review-message", fulfillmentCopy["review-message"]),
        showOrderReference: host.getAttribute("show-order-reference") !== "false",
        statusLabel: requiresReview
            ? text("review-label", fulfillmentCopy["review-label"])
            : awaitingCarrierScan
              ? text("handoff-declared-label", fulfillmentCopy["handoff-declared-label"])
              : statusLabel(status, text),
        statusTone: fulfillmentTone(status, awaitingCarrierScan || requiresReview),
        statusTitle: text("status-label", fulfillmentCopy["status-label"]),
        title: text("title", "Sale shipment"),
        trackingLabel: text("tracking-label", "Track parcel"),
        trackingUrl: safeHttpUrl(shipment?.trackingUrl),
    };
}

function fulfillmentTone(status: string, awaitingCarrierScan: boolean): string {
    if (["incident", "lost", "failed"].includes(status)) {
        return "danger";
    }
    if (["available_for_pickup", "collected_by_recipient"].includes(status)) {
        return "success";
    }
    if (awaitingCarrierScan || ["creating", "created", "label_ready"].includes(status)) {
        return "warning";
    }
    return status ? "info" : "secondary";
}

function record(value: unknown): Value | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Value) : null;
}
