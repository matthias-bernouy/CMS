import { Component } from "@bernouy/components/base";

export class CommerceAccountSalesController extends Component {
    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
        this.observer = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("basic-pagination:change", this.onPageChange);
        this.addEventListener("change", this.onFilterChange);
        const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.observer = new Observer(() => queueMicrotask(() => this.syncPagination()));
        this.observer.observe(this, { childList: true, subtree: true });
        this.syncPagination();
    }

    disconnectedCallback() {
        this.removeEventListener("basic-pagination:change", this.onPageChange);
        this.removeEventListener("change", this.onFilterChange);
        this.observer?.disconnect();
        this.observer = null;
    }

    syncPagination() {
        const offset = nonNegativeInteger(this.offsetControl?.value, 0);
        for (const pagination of this.querySelectorAll("[data-pagination]")) {
            const pageSize = positiveInteger(pagination.getAttribute("page-size"), 10);
            setAttributeIfChanged(pagination, "page", String(Math.floor(offset / pageSize) + 1));
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
