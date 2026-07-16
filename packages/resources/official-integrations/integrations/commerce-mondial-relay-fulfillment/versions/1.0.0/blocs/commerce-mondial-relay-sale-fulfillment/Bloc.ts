import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class CommerceMondialRelaySaleFulfillment extends Component {
    static observedAttributes = [
        "accent-color", "background-color", "border-color", "text-color",
        "button-text-color", "order-id", "order-param",
        "title", "copy", "create-label", "retry-label", "tracking-label", "label-label", "redownload-label", "handoff-label",
    ];

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this.createButton.addEventListener("click", this.onCreate);
        this.labelButton.addEventListener("click", this.onLabel);
        this.handoffButton.addEventListener("click", this.onHandoff);
        this.syncPresentation();
        this.load().catch(error => this.fail(error));
    }

    disconnectedCallback() {
        this.createButton.removeEventListener("click", this.onCreate);
        this.labelButton.removeEventListener("click", this.onLabel);
        this.handoffButton.removeEventListener("click", this.onHandoff);
    }

    attributeChangedCallback(name, previous, current) {
        if (!this.isConnected) return;
        this.syncPresentation();
        if ((name === "order-id" || name === "order-param") && previous !== current) {
            this.load().catch(error => this.fail(error));
        }
    }

    onCreate = () => {
        this.createShipment().catch(error => this.setStatus(errorMessage(error), true));
    };

    onLabel = () => {
        this.requestLabel().catch(error => this.setStatus(errorMessage(error), true));
    };

    onHandoff = () => {
        this.declareHandoff().catch(error => this.setStatus(errorMessage(error), true));
    };

    async load() {
        this.show("loading");
        if (!this.orderId) throw new Error("L’identifiant de la vente est manquant.");
        const result = await this.request(
            `/.cms/sources/system-functions/getShipmentForMySale?orderId=${encodeURIComponent(this.orderId)}`,
        );
        const shipments = Array.isArray(result.shipments) ? result.shipments : [];
        this.render(result, shipments[0] ?? null);
        this.show("content");
    }

    async createShipment() {
        if (!this.orderId) throw new Error("L’identifiant de la vente est manquant.");
        this.createButton.setAttribute("loading", "");
        this.createButton.setAttribute("disabled", "");
        this.setStatus("Création du bordereau…", false);
        try {
            await this.request("/.cms/sources/system-functions/createShipmentForMySale", {
                method: "POST",
                body: JSON.stringify({ orderId: this.orderId }),
            });
            await this.load();
        } finally {
            this.createButton.removeAttribute("loading");
            this.createButton.removeAttribute("disabled");
        }
    }

    async requestLabel() {
        if (!this.orderId) throw new Error("L’identifiant de la vente est manquant.");
        this.labelButton.setAttribute("loading", "");
        this.labelButton.setAttribute("disabled", "");
        try {
            const result = await this.request("/.cms/sources/system-functions/requestShipmentLabelForMySale", {
                method: "POST",
                body: JSON.stringify({ orderId: this.orderId }),
            });
            const labelUrl = safeCmsLabelUrl(result.labelUrl);
            if (!labelUrl) throw new Error("Le lien sécurisé du bordereau est invalide.");
            const link = document.createElement("a");
            link.href = labelUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.hidden = true;
            this.root.append(link);
            link.click();
            link.remove();
        } finally {
            this.labelButton.removeAttribute("loading");
            this.labelButton.removeAttribute("disabled");
        }
    }

    async declareHandoff() {
        if (!this.orderId) throw new Error("L’identifiant de la vente est manquant.");
        this.handoffButton.setAttribute("loading", "");
        this.handoffButton.setAttribute("disabled", "");
        try {
            await this.request("/.cms/sources/system-functions/declareShipmentHandoffForMySale", {
                method: "POST",
                body: JSON.stringify({ orderId: this.orderId }),
            });
            await this.load();
            this.dispatchEvent(new CustomEvent("commerce-fulfillment:updated", {
                bubbles: true,
                composed: true,
                detail: { status: "seller_handoff_declared" },
            }));
        } finally {
            this.handoffButton.removeAttribute("loading");
            this.handoffButton.removeAttribute("disabled");
        }
    }

    render(result, shipment) {
        this.orderNumber.textContent = String(result.orderNumber || result.orderPublicId || "Vente");
        const status = String(shipment?.status || "");
        this.content.dataset.shipmentStatus = status;
        const handoffDeclared = Boolean(shipment?.sellerHandoffDeclaredAt);
        const carrierAccepted = Boolean(shipment?.carrierAcceptedAt);
        const awaitingCarrierScan = status === "label_ready" && handoffDeclared && !carrierAccepted;
        this.content.dataset.awaitingCarrierScan = String(awaitingCarrierScan);
        this.status.textContent = awaitingCarrierScan ? "Dépôt déclaré" : statusLabel(status);
        this.expedition.textContent = String(shipment?.expeditionNumber || "—");
        this.latest.textContent = publicEventLabel(shipment?.latestEventLabel, status);
        this.createButton.textContent = this.text(
            status === "failed" ? "retry-label" : "create-label",
            status === "failed" ? "Réessayer" : "Créer le bordereau",
        );
        this.createButton.hidden = Boolean(shipment) && status !== "failed";
        this.labelButton.textContent = handoffDeclared
            ? this.text("redownload-label", "Retélécharger l’étiquette")
            : this.text("label-label", "Télécharger l’étiquette");
        this.labelButton.hidden = !shipment || status !== "label_ready" || carrierAccepted;
        this.handoffButton.textContent = this.text("handoff-label", "J’ai déposé le colis");
        this.handoffButton.hidden = status !== "label_ready" || handoffDeclared || carrierAccepted;
        this.syncLink(this.trackingLink, shipment?.trackingUrl, this.text("tracking-label", "Suivre le colis"));
        if (awaitingCarrierScan) this.latest.textContent = "En attente du premier scan Mondial Relay.";
        this.setStatus("", false);
    }

    syncLink(element, value, label) {
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

    syncPresentation() {
        this.titleElement.textContent = this.text("title", "Expédition de la vente");
        this.copyElement.textContent = this.text("copy", "Prépare le bordereau, puis suis l’acheminement du colis.");
        const status = this.content.dataset.shipmentStatus || "";
        this.createButton.textContent = this.text(
            status === "failed" ? "retry-label" : "create-label",
            status === "failed" ? "Réessayer" : "Créer le bordereau",
        );
        const handoffDeclared = this.content.dataset.awaitingCarrierScan === "true";
        this.labelButton.textContent = handoffDeclared
            ? this.text("redownload-label", "Retélécharger l’étiquette")
            : this.text("label-label", "Télécharger l’étiquette");
        this.handoffButton.textContent = this.text("handoff-label", "J’ai déposé le colis");
        this.trackingLink.textContent = this.text("tracking-label", "Suivre le colis");
        for (const [attribute, property] of [
            ["accent-color", "--fulfillment-accent"],
            ["background-color", "--fulfillment-background"],
            ["border-color", "--fulfillment-border"],
            ["text-color", "--fulfillment-text"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) this.style.setProperty(property, value);
            else this.style.removeProperty(property);
        }
        const accent = this.getAttribute("accent-color")?.trim() || "var(--secondary-base)";
        const background = this.getAttribute("background-color")?.trim() || "var(--bg-surface)";
        const border = this.getAttribute("border-color")?.trim() || "var(--border-subtle)";
        const text = this.getAttribute("text-color")?.trim() || "var(--text-main)";
        const buttonText = this.getAttribute("button-text-color")?.trim() || "var(--secondary-contrasted)";
        for (const card of this.root.querySelectorAll("basic-card")) {
            card.setAttribute("background-color", background);
            card.setAttribute("border-color", border);
            card.setAttribute("text-color", text);
        }
        this.createButton.setAttribute("accent-color", accent);
        this.createButton.setAttribute("background-color", accent);
        this.createButton.setAttribute("border-color", accent);
        this.createButton.setAttribute("text-color", buttonText);
        this.handoffButton.setAttribute("accent-color", accent);
        this.handoffButton.setAttribute("background-color", accent);
        this.handoffButton.setAttribute("border-color", accent);
        this.handoffButton.setAttribute("text-color", buttonText);
        for (const button of [this.labelButton, this.trackingLink]) {
            button.setAttribute("accent-color", accent);
            button.setAttribute("border-color", accent);
            button.setAttribute("text-color", accent);
        }
    }

    async request(path, init = {}) {
        const response = await fetch(path, {
            credentials: "include",
            ...init,
            headers: {
                accept: "application/json",
                ...(init.body ? { "content-type": "application/json" } : {}),
                ...headers(init.headers),
            },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || body?.message || `${response.status} ${response.statusText}`);
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Réponse invalide du service de livraison.");
        return body;
    }

    fail(error) {
        this.errorMessage.textContent = errorMessage(error);
        this.show("error");
    }

    setStatus(message, error) {
        this.message.textContent = message;
        this.message.toggleAttribute("data-error", error);
    }

    show(state) {
        this.loading.hidden = state !== "loading";
        this.content.hidden = state !== "content";
        this.error.hidden = state !== "error";
    }

    text(attribute, fallback) {
        return this.getAttribute(attribute)?.trim() || fallback;
    }

    get orderId() {
        return this.getAttribute("order-id")?.trim()
            || new URL(location.href).searchParams.get(this.getAttribute("order-param") || "orderId")
            || "";
    }

    get root() { return this.shadowRoot; }
    get loading() { return this.root.querySelector("[data-loading]"); }
    get content() { return this.root.querySelector("[data-content]"); }
    get error() { return this.root.querySelector("[data-error]"); }
    get errorMessage() { return this.root.querySelector("[data-error-message]"); }
    get titleElement() { return this.root.querySelector("[data-title]"); }
    get copyElement() { return this.root.querySelector("[data-copy]"); }
    get orderNumber() { return this.root.querySelector("[data-order-number]"); }
    get status() { return this.root.querySelector("[data-status]"); }
    get expedition() { return this.root.querySelector("[data-expedition]"); }
    get latest() { return this.root.querySelector("[data-latest]"); }
    get createButton() { return this.root.querySelector("[data-create]"); }
    get labelButton() { return this.root.querySelector("[data-label]"); }
    get handoffButton() { return this.root.querySelector("[data-handoff]"); }
    get trackingLink() { return this.root.querySelector("[data-tracking-link]"); }
    get message() { return this.root.querySelector("[data-message]"); }
}

function safeHttpUrl(value) {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
        return "";
    }
}

function safeCmsLabelUrl(value) {
    try {
        const url = new URL(String(value || ""), location.origin);
        return url.origin === location.origin && url.pathname.startsWith("/.cms/sources/") ? url.toString() : "";
    } catch {
        return "";
    }
}

function statusLabel(value) {
    return ({
        creating: "Création en cours", created: "Expédition créée", label_ready: "Bordereau prêt",
        carrier_accepted: "Pris en charge par le transporteur", in_transit: "En cours d’acheminement",
        arrived_at_pickup_point: "Arrivé au point relais", available_for_pickup: "Disponible au point relais",
        collected_by_recipient: "Retiré par le destinataire", incident: "Incident de livraison", lost: "Colis perdu",
        pickup_expired: "Délai de retrait expiré", returning_to_sender: "Retour à l’expéditeur en cours",
        returned_to_sender: "Retourné à l’expéditeur",
        cancelled: "Annulée", failed: "Création échouée", unknown: "Vérification nécessaire",
    })[value] || "Prête à préparer";
}

function statusCopy(value) {
    if (value === "in_transit") return "Le colis est en cours d’acheminement.";
    if (value === "arrived_at_pickup_point") return "Le colis est arrivé au point relais, mais n’a pas encore été retiré.";
    if (value === "available_for_pickup") return "Le colis est disponible au point relais.";
    if (value === "collected_by_recipient") return "Le transporteur confirme le retrait par le destinataire.";
    if (value === "failed") return "La création de l’expédition a échoué et peut être relancée.";
    if (value === "unknown") return "L’expédition doit être vérifiée avant une nouvelle tentative.";
    return value ? "Le bordereau d’expédition est disponible." : "Crée le bordereau lorsque le colis est prêt.";
}

function errorMessage(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    return isFrenchUserMessage(message)
        ? message
        : "Le service de livraison est momentanément indisponible. Réessaie dans quelques instants.";
}

function publicEventLabel(value, status) {
    const label = String(value || "").trim();
    return isFrenchUserMessage(label) ? label : statusCopy(status);
}

function isFrenchUserMessage(value) {
    return Boolean(value) && /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|est|sont|colis|vente|expédition|bordereau|livraison|transporteur|relais|identifiant|statut|réponse)\b/i.test(value);
}

function headers(value) {
    return value ? Object.fromEntries(new Headers(value).entries()) : {};
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceMondialRelaySaleFulfillment);
