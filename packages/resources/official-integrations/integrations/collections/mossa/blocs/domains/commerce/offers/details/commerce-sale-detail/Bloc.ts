import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { errorMessage, saleStatusDefaults } from "./helpers";
import { renderSale } from "./render";

export class CommerceSaleDetail extends Component {
    static observedAttributes = [
        "sale-id",
        "order-param",
        "locale",
        "back-label",
        "eyebrow",
        "date-prefix",
        "articles-title",
        "summary-title",
        "subtotal-label",
        "commission-label",
        "shipping-label",
        "platform-shipping-label",
        "total-label",
        "quantity-label",
        "fallback-article-label",
        "error-title",
        "error-message",
        "card-appearance",
        ...Object.keys(saleStatusDefaults).map((status) => `label-${status}`),
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
        if (!this.isConnected) {
            return;
        }
        this.syncPresentation();
        if (["sale-id", "order-param"].includes(name)) {
            queueMicrotask(() => this.load());
        }
    }

    async load() {
        const version = ++this.requestVersion;
        this.show("loading");
        const id = this.saleId;
        if (!id) {
            return this.fail(new Error(this.text("missing-id-message", "The sale identifier is missing.")));
        }
        try {
            const sale = await requestJson(`/.cms/sources/commerce/mySale?id=${encodeURIComponent(id)}`);
            if (version !== this.requestVersion) {
                return;
            }
            renderSale(this, sale);
            this.show("content");
        } catch (error) {
            if (version === this.requestVersion) {
                this.fail(error);
            }
        }
    }

    syncPresentation() {
        for (const card of this.root.querySelectorAll("[data-articles-card], [data-summary-card]")) {
            card.setAttribute("appearance", this.getAttribute("card-appearance") || "outlined");
        }
        const errorCard = this.root.querySelector("[data-error]");
        errorCard.setAttribute("appearance", this.getAttribute("card-appearance") || "outlined");
        for (const button of this.querySelectorAll('[slot="error-action"] > a[data-error-back]')) {
            button.textContent = this.text("back-label", "Back to sales");
        }
        const labels = [
            ["[data-eyebrow]", "eyebrow", "SALE"],
            ["[data-articles-title]", "articles-title", "Sold items"],
            ["[data-summary-title]", "summary-title", "Summary"],
            ["[data-subtotal-label]", "subtotal-label", "Sale price"],
            ["[data-commission-label]", "commission-label", "Platform commission"],
            ["[data-shipping-label]", "shipping-label", "Delivery"],
            ["[data-total-label]", "total-label", "Net amount to receive"],
            ["[data-error-title]", "error-title", "Sale not found"],
        ];
        for (const [selector, attribute, fallback] of labels) {
            this.setText(selector, this.text(attribute, fallback));
        }
    }

    syncFulfillment = () => {
        this.root.querySelector("[data-fulfillment]").hidden =
            this.fulfillmentSlot.assignedElements({ flatten: true }).length === 0;
    };
    onFulfillmentUpdated = () => {
        this.load();
    };
    statusLabel(status) {
        return this.getAttribute(`label-${status}`) || saleStatusDefaults[status] || "To review";
    }
    text(attribute, fallback) {
        return this.getAttribute(attribute)?.trim() || fallback;
    }
    setText(selector, value) {
        this.root.querySelector(selector).textContent = value;
    }
    show(state) {
        this.loading.hidden = state !== "loading";
        this.content.hidden = state !== "content";
        this.error.hidden = state !== "error";
    }
    fail(error) {
        this.root.querySelector("[data-error-message]").textContent = errorMessage(
            error,
            this.text("error-message", "This sale could not be loaded."),
        );
        this.show("error");
    }
    onPopState = () => this.load();
    get saleId() {
        return (
            this.getAttribute("sale-id")?.trim() ||
            new URL(location.href).searchParams.get(this.getAttribute("order-param") || "orderId") ||
            ""
        );
    }
    get locale() {
        return this.getAttribute("locale") || "en-US";
    }
    get root() {
        return this.shadowRoot;
    }
    get loading() {
        return this.root.querySelector("[data-loading]");
    }
    get content() {
        return this.root.querySelector("[data-content]");
    }
    get error() {
        return this.root.querySelector("[data-error]");
    }
    get fulfillmentSlot() {
        return this.root.querySelector('slot[name="fulfillment"]');
    }
}

async function requestJson(path) {
    const response = await fetch(path, { credentials: "include", headers: { accept: "application/json" } });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(body?.error || body?.message || `${response.status} ${response.statusText}`);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Invalid Commerce service response.");
    }
    return body;
}
customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceSaleDetail);
