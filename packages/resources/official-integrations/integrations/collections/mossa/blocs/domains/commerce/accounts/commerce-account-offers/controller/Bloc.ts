import { Component } from "@bernouy/components/base";

import { positiveInteger, setAttributeIfChanged, statusCodes, statusDefaults } from "./helpers";
import { syncPresentation, syncRenderedOffers } from "./presentation";

export class CommerceAccountOffers extends Component {
    static observedAttributes = [
        "create-label",
        "create-url",
        "edit-label",
        "edit-url",
        "price-label",
        "pending-price-label",
        "updated-on-template",
        ...["previous-label", "next-label", "summary-template", "tone"].map((name) => `pagination-${name}`),
        "price-url",
        "view-label",
        "view-url",
        "empty-filtered-title",
        "empty-filtered-message",
        "empty-title",
        "empty-message",
        "error-message",
        "grid-gap",
        "grid-max",
        "grid-min",
        "grid-packing",
        "card-stretch",
        "image-fit",
        "image-height",
        "locale",
        "page-param",
        "page-size",
        "status-label",
        "status-param",
        "sync-url",
        ...statusCodes.map((status) => `label-${status.replaceAll("_", "-")}`),
        ...["image", "price", "status", "updated-at"].map((field) => `show-${field}`),
    ];

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
        this.page = 1;
        this.status = "all";
        this.observer = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("mossa-pagination:change", this.onPageChange);
        const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.observer = new Observer(() => queueMicrotask(() => this.syncRenderedOffers()));
        this.observer.observe(this, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["data-media-id", "data-source-height", "data-source-width"],
        });
        this.readUrlState();
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("mossa-pagination:change", this.onPageChange);
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            queueMicrotask(() => this.sync());
        }
    }

    sync() {
        const pageSize = positiveInteger(this.getAttribute("page-size"), 12);
        const offset = (this.page - 1) * pageSize;
        const source = `/.cms/sources/commerce/listMyOffers?status=${encodeURIComponent(this.status)}&limit=${pageSize}&offset=${offset}`;
        setAttributeIfChanged(this.querySelector("[data-offers-source]"), "cms-source", source);

        syncPresentation(this, pageSize);
        this.syncRenderedOffers();
    }

    syncRenderedOffers() {
        syncRenderedOffers(this);
    }

    statusLabel(status) {
        const code = statusCodes.includes(status) ? status : "draft";
        return this.getAttribute(`label-${code.replaceAll("_", "-")}`) || statusDefaults[code];
    }

    offerAction(workflowState, publiclyVisible) {
        if (workflowState === "awaiting_seller_price") {
            const url = this.getAttribute("price-url")?.trim() || "";
            if (!url) {
                return null;
            }
            return {
                label: this.getAttribute("price-label") || "Set my price",
                url,
            };
        }
        if (["draft", "changes_requested"].includes(workflowState)) {
            const url = this.getAttribute("edit-url")?.trim() || "";
            if (!url) {
                return null;
            }
            return {
                label: this.getAttribute("edit-label") || "Edit",
                url,
            };
        }
        if (!publiclyVisible) {
            return null;
        }
        const url = this.getAttribute("view-url")?.trim() || this.getAttribute("edit-url")?.trim() || "";
        return url ? { label: this.getAttribute("view-label") || "View", url } : null;
    }

    readUrlState() {
        if (this.getAttribute("sync-url") === "false" || typeof location === "undefined") {
            return;
        }
        const params = new URLSearchParams(location.search);
        const status = params.get(this.getAttribute("status-param") || "status");
        if (statusCodes.includes(status)) {
            this.status = status;
        }
        this.page = positiveInteger(params.get(this.getAttribute("page-param") || "page"), 1);
    }

    writeUrlState() {
        if (
            this.getAttribute("sync-url") === "false" ||
            typeof location === "undefined" ||
            typeof history === "undefined"
        ) {
            return;
        }
        const url = new URL(location.href);
        const statusParam = this.getAttribute("status-param") || "status";
        const pageParam = this.getAttribute("page-param") || "page";
        if (this.status === "all") {
            url.searchParams.delete(statusParam);
        } else {
            url.searchParams.set(statusParam, this.status);
        }
        if (this.page <= 1) {
            url.searchParams.delete(pageParam);
        } else {
            url.searchParams.set(pageParam, String(this.page));
        }
        history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    onFilterChange = (event) => {
        if (!event.target?.matches?.("[data-status-filter]")) {
            return;
        }
        const status = String(event.target.value || "all");
        if (!statusCodes.includes(status)) {
            return;
        }
        this.status = status;
        this.page = 1;
        this.writeUrlState();
        this.sync();
    };

    onPageChange = (event) => {
        if (!event.target?.matches?.("[data-pagination]")) {
            return;
        }
        this.page = positiveInteger(event.detail?.page, 1);
        this.writeUrlState();
        this.sync();
        this.scrollIntoView({ behavior: "smooth", block: "start" });
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceAccountOffers);
