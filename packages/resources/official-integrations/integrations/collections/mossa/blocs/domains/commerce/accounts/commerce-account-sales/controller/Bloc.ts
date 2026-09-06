import { Component } from "@bernouy/components/base";

const salesCopy = {
    "status-label": {
        selector: "[data-pagination-reset]",
        text: "Filter sales by status",
        attribute: "accessible-label",
    },
    "loading-label": { selector: "[data-sales-loading]", text: "Loading sales", attribute: "label" },
    "empty-title": { selector: '[data-copy="empty-title"]', text: "No sales yet" },
    "empty-message": { selector: '[data-copy="empty-message"]', text: "Buyer orders will appear here." },
    "sold-on-label": { selector: '[data-copy="sold-on-label"]', text: "Sold on" },
    "items-label": { selector: '[data-copy="items-label"]', text: "items" },
    "error-message": { selector: "[data-sales-error]", text: "Sales could not be loaded. Try again shortly." },
    "pagination-previous-label": { selector: "[data-pagination]", text: "Previous", attribute: "previous-label" },
    "pagination-next-label": { selector: "[data-pagination]", text: "Next", attribute: "next-label" },
    "pagination-summary-template": {
        selector: "[data-pagination]",
        text: "Page {page} of {pages}",
        attribute: "summary-template",
    },
    "pagination-tone": { selector: "[data-pagination]", text: "neutral", attribute: "tone" },
    "label-all": { selector: '[data-copy="label-all"]', text: "All" },
    "label-awaiting_quote": { selector: '[data-copy="label-awaiting_quote"]', text: "Delivery to complete" },
    "label-awaiting_payment": { selector: '[data-copy="label-awaiting_payment"]', text: "Payment pending" },
    "label-active": { selector: '[data-copy="label-active"]', text: "To ship" },
    "label-completed": { selector: '[data-copy="label-completed"]', text: "Completed" },
    "label-cancellation_pending": {
        selector: '[data-copy="label-cancellation_pending"]',
        text: "Cancellation in progress",
    },
    "label-cancelled": { selector: '[data-copy="label-cancelled"]', text: "Cancelled" },
    "label-expired": { selector: '[data-copy="label-expired"]', text: "Expired" },
};

export class CommerceAccountSalesController extends Component {
    static observedAttributes = ["sale-action-label", "sale-url", ...Object.keys(salesCopy)];

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
        this.observer = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("mossa-pagination:change", this.onPageChange);
        this.addEventListener("change", this.onFilterChange);
        const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.observer = new Observer(() =>
            queueMicrotask(() => {
                this.syncPagination();
                this.syncLinks();
                this.syncCopy();
            }),
        );
        this.observer.observe(this, { childList: true, subtree: true });
        this.syncPagination();
        this.syncLinks();
        this.syncCopy();
    }

    disconnectedCallback() {
        this.removeEventListener("mossa-pagination:change", this.onPageChange);
        this.removeEventListener("change", this.onFilterChange);
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.syncLinks();
            this.syncCopy();
        }
    }

    syncPagination() {
        const offset = nonNegativeInteger(this.offsetControl?.value, 0);
        for (const pagination of this.querySelectorAll("[data-pagination]")) {
            const pageSize = positiveInteger(pagination.getAttribute("page-size"), 10);
            setAttributeIfChanged(pagination, "page", String(Math.floor(offset / pageSize) + 1));
        }
    }

    syncLinks() {
        const template = this.getAttribute("sale-url")?.trim() || "";
        for (const link of this.querySelectorAll("[data-sale-link]")) {
            const saleId = link.getAttribute("data-sale-id") || "";
            const label = this.getAttribute("sale-action-label")?.trim() || "View sale";
            if (link.textContent !== label) {
                link.textContent = label;
            }
            link.closest("mossa-button")?.toggleAttribute("hidden", !template || !saleId);
            if (template && saleId) {
                link.setAttribute("href", template.replaceAll("{saleId}", encodeURIComponent(saleId)));
            } else {
                link.removeAttribute("href");
            }
        }
    }

    syncCopy() {
        for (const [attribute, field] of Object.entries(salesCopy)) {
            const value = this.getAttribute(attribute)?.trim() || field.text;
            for (const element of this.querySelectorAll(field.selector)) {
                if (field.attribute) {
                    setAttributeIfChanged(element, field.attribute, value);
                } else if (element.textContent !== value) {
                    element.textContent = value;
                }
            }
        }
    }

    setOffset(value) {
        const control = this.offsetControl;
        if (!control) {
            return;
        }
        control.value = value > 0 ? String(value) : "";
        control.dispatchEvent(new Event("change", { bubbles: true }));
        this.syncPagination();
    }

    onPageChange = (event) => {
        if (event.target?.matches?.("[data-pagination]")) {
            this.setOffset(nonNegativeInteger(event.detail?.offset, 0));
        }
    };

    onFilterChange = (event) => {
        if (event.target?.matches?.("[data-pagination-reset]")) {
            this.setOffset(0);
        }
    };

    get offsetControl() {
        return this.querySelector("[data-pagination-offset]");
    }
}

function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function setAttributeIfChanged(element, name, value) {
    if (element && element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceAccountSalesController);
