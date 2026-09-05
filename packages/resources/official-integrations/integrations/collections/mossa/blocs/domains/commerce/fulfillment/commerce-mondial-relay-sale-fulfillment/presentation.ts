import { fulfillmentCopy, publicEventLabel, safeHttpUrl, statusLabel } from "./helpers";

export function renderFulfillment(host, result, shipment, resetMessage = true) {
    host.orderNumber.textContent = String(
        result.orderNumber || result.orderPublicId || host.text("sale-label", "Sale"),
    );
    const status = String(shipment?.status || "");
    host.content.dataset.shipmentStatus = status;
    const handoffDeclared = Boolean(shipment?.sellerHandoffDeclaredAt);
    const carrierAccepted = Boolean(shipment?.carrierAcceptedAt);
    const awaitingCarrierScan = status === "label_ready" && handoffDeclared && !carrierAccepted;
    host.content.dataset.awaitingCarrierScan = String(awaitingCarrierScan);
    host.status.textContent = awaitingCarrierScan
        ? host.text("handoff-declared-label", "Handoff declared")
        : statusLabel(status, host.text.bind(host));
    host.expedition.textContent = String(shipment?.expeditionNumber || "—");
    host.latest.textContent = publicEventLabel(shipment?.latestEventLabel, status, host.text.bind(host));
    host.createButton.textContent = host.text(
        status === "failed" ? "retry-label" : "create-label",
        status === "failed" ? "Try again" : "Create shipping label",
    );
    host.createButton.hidden = Boolean(shipment) && status !== "failed";
    host.labelButton.textContent = handoffDeclared
        ? host.text("redownload-label", "Download label again")
        : host.text("label-label", "Download label");
    host.labelButton.hidden = !shipment || status !== "label_ready" || carrierAccepted;
    host.handoffButton.textContent = host.text("handoff-label", "I handed off the parcel");
    host.handoffButton.hidden = status !== "label_ready" || handoffDeclared || carrierAccepted;
    syncLink(host.trackingLink, shipment?.trackingUrl, host.text("tracking-label", "Track parcel"));
    if (awaitingCarrierScan) {
        host.latest.textContent = host.text("carrier-scan-pending-message", "Waiting for the carrier's first scan.");
    }
    if (resetMessage) {
        host.setStatus("", false);
    }
}

export function syncFulfillmentPresentation(host) {
    for (const element of host.root.querySelectorAll("[data-fulfillment-copy]")) {
        const name = element.dataset.fulfillmentCopy;
        element.textContent = host.text(name, fulfillmentCopy[name]);
    }
    host.loading.querySelector("mossa-skeleton").setAttribute("label", host.text("loading-label", "Loading shipment"));
    if (host.projection) {
        renderFulfillment(host, host.projection, host.projection.shipments[0] || null, false);
    }
    host.root.querySelector("[data-error-title]").textContent = host.text("error-title", "Shipment unavailable");
    host.errorMessage.textContent = host.text("error-message", host.lastErrorMessage || "");
    host.titleElement.textContent = host.text("title", "Sale shipment");
    host.copyElement.textContent = host.text("copy", "Prepare the label, then track the parcel.");
    const status = host.content.dataset.shipmentStatus || "";
    host.createButton.textContent = host.text(
        status === "failed" ? "retry-label" : "create-label",
        status === "failed" ? "Try again" : "Create shipping label",
    );
    const handoffDeclared = host.content.dataset.awaitingCarrierScan === "true";
    host.labelButton.textContent = handoffDeclared
        ? host.text("redownload-label", "Download label again")
        : host.text("label-label", "Download label");
    host.handoffButton.textContent = host.text("handoff-label", "I handed off the parcel");
    host.trackingLink.textContent = host.text("tracking-label", "Track parcel");
}

function syncLink(element, value, label) {
    const url = safeHttpUrl(value);
    element.hidden = !url;
    element.textContent = label;
    if (url) {
        element.setAttribute("href", url);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
    } else {
        element.removeAttribute("href");
    }
}
