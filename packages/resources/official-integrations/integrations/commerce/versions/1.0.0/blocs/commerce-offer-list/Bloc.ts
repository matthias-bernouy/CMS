import {
    activeFilterParams, activeMetadataFilters, filterSignature, fixedFilters,
    positiveInteger, readFilterParams, readMetadataFilters, setAttributeIfChanged,
    validIdentifier,
} from "./helpers";
import { syncOfferListPresentation } from "./presentation";

export class CommerceOfferList extends HTMLElement {
    static observedAttributes = [
        "condition-code",
        "category",
        "brand",
        "card-stretch",
        "data-alias",
        "grid-gap",
        "grid-max",
        "grid-min",
        "grid-packing",
        "maximum-price",
        "minimum-price",
        "page-param",
        "page-size",
        "product-id",
        "seller-id",
        "sort",
        "source-id",
        "source-prefix",
        "sync-url",
        "variant-id",
    ];

    constructor() {
        super();
        this.page = 1;
        this.filterParams = [];
        this.metadataFilters = [];
        this.filterSignature = "";
        this.observer = null;
    }

    connectedCallback() {
        this.style.display = "contents";
        this.filterParams = readFilterParams(this);
        this.metadataFilters = readMetadataFilters(this);
        this.page = this.readPage();
        this.filterSignature = this.currentFilterSignature();
        this.addEventListener("basic-pagination:change", this.onPageChange);
        this.ownerDocument.addEventListener("cms-params:change", this.onParamsChange);
        this.ownerDocument.defaultView?.addEventListener("popstate", this.onPopState);
        const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.observer = new Observer(() => {
            this.filterParams = readFilterParams(this);
            this.metadataFilters = readMetadataFilters(this);
            this.syncSource();
        });
        this.observer.observe(this, { attributes: true, childList: true, subtree: true });
        this.syncPagination();
        this.syncSource();
    }

    disconnectedCallback() {
        this.removeEventListener("basic-pagination:change", this.onPageChange);
        this.ownerDocument.removeEventListener("cms-params:change", this.onParamsChange);
        this.ownerDocument.defaultView?.removeEventListener("popstate", this.onPopState);
        this.observer?.disconnect();
        this.observer = null;
    }
    attributeChangedCallback() {
        if (this.isConnected) this.syncSource();
    }

    readPage() {
        if (!this.syncsUrl || typeof location === "undefined") return 1;
        return positiveInteger(new URLSearchParams(location.search).get(this.pageParam), 1);
    }
    syncSource() {
        const prefix = (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
        const sourceId = encodeURIComponent(this.getAttribute("source-id") || "commerce");
        const pageSize = positiveInteger(this.getAttribute("page-size"), 12);
        const params = new URLSearchParams({
            limit: String(pageSize),
            offset: String((this.page - 1) * pageSize),
        });
        const urlParams = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
        for (const [endpointParam, value] of activeFilterParams(this.filterParams, urlParams)) {
            params.set(endpointParam, value);
        }
        for (const [attribute, endpointParam] of fixedFilters) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) params.set(endpointParam, value);
        }
        const filters = activeMetadataFilters(this.metadataFilters, urlParams);
        if (params.get("category") && Object.keys(filters).length > 0) {
            params.set("filters", JSON.stringify(filters));
        }
        const alias = validIdentifier(this.getAttribute("data-alias")) || "data";
        const source = `${prefix}/${sourceId}/offers?${params.toString()} as ${alias}`;
        if (this.getAttribute("cms-source") !== source) this.setAttribute("cms-source", source);
        this.syncPagination();
        syncOfferListPresentation(this);
    }
    syncPagination() {
        const pageSize = String(positiveInteger(this.getAttribute("page-size"), 12));
        for (const pagination of this.querySelectorAll("basic-pagination")) {
            setAttributeIfChanged(pagination, "page", String(this.page));
            setAttributeIfChanged(pagination, "page-size", pageSize);
        }
    }
    writePage() {
        if (!this.syncsUrl || typeof location === "undefined" || typeof history === "undefined") return;
        const url = new URL(location.href);
        if (this.page <= 1) url.searchParams.delete(this.pageParam);
        else url.searchParams.set(this.pageParam, String(this.page));
        history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    currentFilterSignature() {
        return filterSignature(this.filterParams, this.metadataFilters);
    }

    onPageChange = event => {
        if (event.target?.closest?.("commerce-offer-list") !== this) return;
        this.page = positiveInteger(event.detail?.page, 1);
        this.writePage();
        this.syncSource();
        if (this.getAttribute("scroll-on-page-change") !== "false") {
            this.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    onParamsChange = () => {
        const signature = this.currentFilterSignature();
        if (signature === this.filterSignature) return;
        this.filterSignature = signature;
        if (this.page !== 1) {
            this.page = 1;
            this.writePage();
            this.syncSource();
        } else this.syncSource();
    };

    onPopState = () => {
        const page = this.readPage();
        const signature = this.currentFilterSignature();
        if (page === this.page && signature === this.filterSignature) return;
        this.page = page;
        this.filterSignature = signature;
        this.syncSource();
    };

    get pageParam() { return this.getAttribute("page-param")?.trim() || "page"; }
    get syncsUrl() { return this.getAttribute("sync-url") !== "false"; }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferList);
