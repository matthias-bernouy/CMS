import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { errorMessage, headers, isRecord, safeCmsLabelUrl } from "./helpers";
import { renderFulfillment, syncFulfillmentPresentation } from "./presentation";

export class CommerceMondialRelaySaleFulfillment extends Component {
    static observedAttributes = [
        "accent-color", "background-color", "border-color", "text-color",
        "button-text-color", "order-id", "order-param",
        "title", "copy", "create-label", "retry-label", "tracking-label", "label-label", "redownload-label", "handoff-label",
    ];

    constructor() {
        super({ css, template });
        this.projection = null;
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
        this.showProjection(result, shipments[0] ?? null);
    }

    async createShipment() {
        if (!this.orderId) throw new Error("L’identifiant de la vente est manquant.");
        this.createButton.setAttribute("loading", "");
        this.createButton.setAttribute("disabled", "");
        this.setStatus("Création du bordereau…", false);
        try {
            const result = await this.request("/.cms/sources/system-functions/createShipmentForMySale", {
                method: "POST",
                body: JSON.stringify({ orderId: this.orderId }),
            });
            await this.showMutation(result);
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
            const result = await this.request("/.cms/sources/system-functions/declareShipmentHandoffForMySale", {
                method: "POST",
                body: JSON.stringify({ orderId: this.orderId }),
            });
            await this.showMutation(result);
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
        renderFulfillment(this, result, shipment);
    }

    showProjection(result, shipment) {
        this.projection = { ...result, shipments: shipment ? [shipment] : [] };
        this.render(this.projection, shipment);
        this.show("content");
    }

    async showMutation(result) {
        if (!this.projection) {
            await this.load();
            return;
        }
        const returnedShipment = isRecord(result.shipment) ? result.shipment : null;
        if (!returnedShipment) throw new Error("Réponse invalide du service de livraison.");
        const previousShipment = Array.isArray(this.projection.shipments)
            && isRecord(this.projection.shipments[0]) ? this.projection.shipments[0] : {};
        const shipment = { ...previousShipment, ...returnedShipment };
        const projection = {
            ...this.projection,
            ...(result.orderId !== undefined ? { orderId: result.orderId } : {}),
            ...(result.orderPublicId !== undefined ? { orderPublicId: result.orderPublicId } : {}),
        };
        this.showProjection(projection, shipment);
    }

    syncPresentation() {
        syncFulfillmentPresentation(this);
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

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceMondialRelaySaleFulfillment);
