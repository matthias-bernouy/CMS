import { publicEventLabel, safeHttpUrl, statusLabel } from "./helpers";

export function renderFulfillment(host, result, shipment) {
    host.orderNumber.textContent = String(result.orderNumber || result.orderPublicId || "Vente");
    const status = String(shipment?.status || "");
    host.content.dataset.shipmentStatus = status;
    const handoffDeclared = Boolean(shipment?.sellerHandoffDeclaredAt);
    const carrierAccepted = Boolean(shipment?.carrierAcceptedAt);
    const awaitingCarrierScan = status === "label_ready" && handoffDeclared && !carrierAccepted;
    host.content.dataset.awaitingCarrierScan = String(awaitingCarrierScan);
    host.status.textContent = awaitingCarrierScan ? "Dépôt déclaré" : statusLabel(status);
    host.expedition.textContent = String(shipment?.expeditionNumber || "—");
    host.latest.textContent = publicEventLabel(shipment?.latestEventLabel, status);
    host.createButton.textContent = host.text(
        status === "failed" ? "retry-label" : "create-label",
        status === "failed" ? "Réessayer" : "Créer le bordereau",
    );
    host.createButton.hidden = Boolean(shipment) && status !== "failed";
    host.labelButton.textContent = handoffDeclared
        ? host.text("redownload-label", "Retélécharger l’étiquette")
        : host.text("label-label", "Télécharger l’étiquette");
    host.labelButton.hidden = !shipment || status !== "label_ready" || carrierAccepted;
    host.handoffButton.textContent = host.text("handoff-label", "J’ai déposé le colis");
    host.handoffButton.hidden = status !== "label_ready" || handoffDeclared || carrierAccepted;
    syncLink(host.trackingLink, shipment?.trackingUrl, host.text("tracking-label", "Suivre le colis"));
    if (awaitingCarrierScan) {
        host.latest.textContent = "En attente du premier scan Mondial Relay.";
    }
    host.setStatus("", false);
}

export function syncFulfillmentPresentation(host) {
    host.titleElement.textContent = host.text("title", "Expédition de la vente");
    host.copyElement.textContent = host.text("copy", "Prépare le bordereau, puis suis l’acheminement du colis.");
    const status = host.content.dataset.shipmentStatus || "";
    host.createButton.textContent = host.text(
        status === "failed" ? "retry-label" : "create-label",
        status === "failed" ? "Réessayer" : "Créer le bordereau",
    );
    const handoffDeclared = host.content.dataset.awaitingCarrierScan === "true";
    host.labelButton.textContent = handoffDeclared
        ? host.text("redownload-label", "Retélécharger l’étiquette")
        : host.text("label-label", "Télécharger l’étiquette");
    host.handoffButton.textContent = host.text("handoff-label", "J’ai déposé le colis");
    host.trackingLink.textContent = host.text("tracking-label", "Suivre le colis");
    syncTheme(host);
}

function syncTheme(host) {
    for (const [attribute, property] of [
        ["accent-color", "--fulfillment-accent"],
        ["background-color", "--fulfillment-background"],
        ["border-color", "--fulfillment-border"],
        ["text-color", "--fulfillment-text"],
    ]) {
        const value = host.getAttribute(attribute)?.trim();
        if (value) {
            host.style.setProperty(property, value);
        } else {
            host.style.removeProperty(property);
        }
    }
    const accent = host.getAttribute("accent-color")?.trim() || "var(--secondary-base)";
    const background = host.getAttribute("background-color")?.trim() || "var(--bg-surface)";
    const border = host.getAttribute("border-color")?.trim() || "var(--border-subtle)";
    const text = host.getAttribute("text-color")?.trim() || "var(--text-main)";
    const buttonText = host.getAttribute("button-text-color")?.trim() || "var(--secondary-contrasted)";
    for (const card of host.root.querySelectorAll("basic-card")) {
        card.setAttribute("background-color", background);
        card.setAttribute("border-color", border);
        card.setAttribute("text-color", text);
    }
    for (const button of [host.createButton, host.handoffButton]) {
        button.setAttribute("accent-color", accent);
        button.setAttribute("background-color", accent);
        button.setAttribute("border-color", accent);
        button.setAttribute("text-color", buttonText);
    }
    for (const button of [host.labelButton, host.trackingLink]) {
        button.setAttribute("accent-color", accent);
        button.setAttribute("border-color", accent);
        button.setAttribute("text-color", accent);
    }
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
