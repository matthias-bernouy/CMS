import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { errorMessage, saleStatusDefaults } from "./helpers";
import { copyColors, renderSale } from "./render";

export class CommerceSaleDetail extends Component {
    static observedAttributes = [
        "source-id", "source-prefix", "sale-endpoint", "sale-endpoint-param", "sale-id", "order-param",
        "locale", "back-url", "back-label", "eyebrow", "date-prefix", "articles-title", "summary-title",
        "subtotal-label", "commission-label", "shipping-label", "platform-shipping-label", "total-label",
        "quantity-label", "fallback-article-label",
        "error-title", "error-message", "card-appearance", "text-color", "muted-text-color",
        "accent-color", "border-color", "status-background-color", "status-text-color", "success-color", "danger-color",
        ...["card", "button"].flatMap(prefix => ["text", "background", "border", "accent"].map(name => `${prefix}-${name}-color`)),
        ...Object.keys(saleStatusDefaults).map(status => `label-${status}`),
    ];

    constructor() {
        super({ css, template });
        this.requestVersion = 0;
    }

    connectedCallback() {
        window.addEventListener("popstate", this.onPopState);
        this.addEventListener("commerce-fulfillment:updated", this.onFulfillmentUpdated);
        this.fulfillmentSlot.addEventListener("slotchange", this.syncFulfillment);
        this.syncPresentation();
        this.syncFulfillment();
        this.load();
    }

    disconnectedCallback() {
        window.removeEventListener("popstate", this.onPopState);
        this.removeEventListener("commerce-fulfillment:updated", this.onFulfillmentUpdated);
        this.fulfillmentSlot.removeEventListener("slotchange", this.syncFulfillment);
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) return;
        this.syncPresentation();
        if (["source-id", "source-prefix", "sale-endpoint", "sale-endpoint-param", "sale-id", "order-param"].includes(name)) {
            queueMicrotask(() => this.load());
        }
    }

    async load() {
        const version = ++this.requestVersion;
        this.show("loading");
        const id = this.saleId;
        if (!id) return this.fail(new Error(this.text("missing-id-message", "L’identifiant de vente est manquant.")));
        try {
            const query = new URLSearchParams({ [this.endpointParam]: id });
            const sale = await requestJson(`${this.sourceBase}/${encodeURIComponent(this.endpoint)}?${query}`);
            if (version !== this.requestVersion) return;
            renderSale(this, sale);
            this.show("content");
        } catch (error) {
            if (version === this.requestVersion) this.fail(error);
        }
    }

    syncPresentation() {
        for (const [attribute, property, fallback] of [
            ["text-color", "--commerce-sale-text", "var(--text-main)"], ["muted-text-color", "--commerce-sale-muted", "var(--text-muted)"],
            ["accent-color", "--commerce-sale-accent", "var(--secondary-base)"], ["border-color", "--commerce-sale-border", "var(--border-subtle)"],
            ["status-background-color", "--commerce-sale-status-background", "var(--secondary-base)"], ["status-text-color", "--commerce-sale-status-text", "var(--secondary-contrasted)"],
            ["success-color", "--commerce-sale-success", "var(--success-base, #287a4d)"], ["danger-color", "--commerce-sale-danger", "var(--danger-base, #b42318)"],
        ]) this.style.setProperty(property, this.getAttribute(attribute)?.trim() || fallback);
        for (const card of this.root.querySelectorAll("[data-articles-card], [data-summary-card]")) {
            card.setAttribute("appearance", this.getAttribute("card-appearance") || "outlined");
            copyColors(this, card, "card");
        }
        const errorCard = this.root.querySelector("[data-error]");
        errorCard.setAttribute("appearance", this.getAttribute("card-appearance") || "outlined");
        copyColors(this, errorCard, "card");
        for (const button of this.root.querySelectorAll("[data-error-back]")) {
            button.setAttribute("href", this.getAttribute("back-url") || "/account/sales");
            button.textContent = this.text("back-label", "Retour aux ventes");
            copyColors(this, button, "button");
        }
        const labels = [["[data-eyebrow]", "eyebrow", "VENTE"], ["[data-articles-title]", "articles-title", "Articles vendus"], ["[data-summary-title]", "summary-title", "Récapitulatif"], ["[data-subtotal-label]", "subtotal-label", "Prix de vente"], ["[data-commission-label]", "commission-label", "Commission Courtside"], ["[data-shipping-label]", "shipping-label", "Livraison"], ["[data-total-label]", "total-label", "Montant net à recevoir"], ["[data-error-title]", "error-title", "Vente introuvable"]];
        for (const [selector, attribute, fallback] of labels) this.setText(selector, this.text(attribute, fallback));
    }

    syncFulfillment = () => { this.root.querySelector("[data-fulfillment]").hidden = this.fulfillmentSlot.assignedElements({ flatten: true }).length === 0; };
    onFulfillmentUpdated = () => { this.load(); };
    statusLabel(status) { return this.getAttribute(`label-${status}`) || saleStatusDefaults[status] || "Statut indisponible"; }
    text(attribute, fallback) { return this.getAttribute(attribute)?.trim() || fallback; }
    setText(selector, value) { this.root.querySelector(selector).textContent = value; }
    show(state) { this.loading.hidden = state !== "loading"; this.content.hidden = state !== "content"; this.error.hidden = state !== "error"; }
    fail(error) { this.root.querySelector("[data-error-message]").textContent = errorMessage(error, this.text("error-message", "Impossible de charger cette vente.")); this.show("error"); }
    onPopState = () => this.load();
    get saleId() { return this.getAttribute("sale-id")?.trim() || new URL(location.href).searchParams.get(this.getAttribute("order-param") || "orderId") || ""; }
    get sourceBase() { return `${(this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "")}/${encodeURIComponent(this.getAttribute("source-id") || "commerce")}`; }
    get endpoint() { return this.getAttribute("sale-endpoint") || "mySale"; }
    get endpointParam() { return this.getAttribute("sale-endpoint-param") || "id"; }
    get locale() { return this.getAttribute("locale") || "fr-FR"; }
    get root() { return this.shadowRoot; }
    get loading() { return this.root.querySelector("[data-loading]"); }
    get content() { return this.root.querySelector("[data-content]"); }
    get error() { return this.root.querySelector("[data-error]"); }
    get fulfillmentSlot() { return this.root.querySelector('slot[name="fulfillment"]'); }
}

async function requestJson(path) { const response = await fetch(path, { credentials: "include", headers: { accept: "application/json" } }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error || body?.message || `${response.status} ${response.statusText}`); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Réponse du service Commerce invalide."); return body; }
customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceSaleDetail);
