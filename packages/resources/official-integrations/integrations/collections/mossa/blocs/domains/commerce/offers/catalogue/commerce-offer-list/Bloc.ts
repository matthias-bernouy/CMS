import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import { offerListPresentation, presentationAttributes } from "./presentation";

export class CommerceOfferList extends HTMLElement {
    static observedAttributes = presentationAttributes;

    observer = null;

    connectedCallback() {
        this.style.display = "contents";
        setSourceContext(this.source, (value) => ({ presentation: offerListPresentation(this, value, this.offset) }));
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("mossa-pagination:change", this.onPageChange);
        const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.observer = new Observer(() => queueMicrotask(() => this.syncMetadataState()));
        this.observer.observe(this, { childList: true, subtree: true });
        this.syncMetadataState();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("mossa-pagination:change", this.onPageChange);
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            refreshSourceContext(this.source);
        }
    }

    onFilterChange = (event) => {
        const control = event.target instanceof Element ? event.target.closest("[cms-param-sync]") : null;
        if (!control || control === this.offsetControl) {
            return;
        }
        this.setOffset(0);
        this.syncMetadataState();
    };

    onPageChange = (event) => {
        if (event.target instanceof Element && event.target.localName === "mossa-pagination") {
            this.setOffset(event.detail?.offset);
            if (this.getAttribute("scroll-on-page-change") !== "false") {
                this.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }
    };

    setOffset(value) {
        this.offsetControl.value = String(nonNegativeInteger(value));
        this.offsetControl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    syncMetadataState() {
        const filters = {};
        for (const control of this.querySelectorAll('[cms-param-sync^="filter_"]')) {
            const parameter = control.getAttribute("cms-param-sync")?.slice("filter_".length) || "";
            const [field, operator = "eq"] = parameter.split(":");
            const raw = String(control.value || "").trim();
            if (!field || !raw) {
                continue;
            }
            const type = control.getAttribute("cms-form-value-type") || control.getAttribute("type");
            const value = type === "number" ? Number(raw) : type === "boolean" ? raw === "true" : raw;
            if (type === "number" && !Number.isFinite(value)) {
                continue;
            }
            filters[field] ||= {};
            filters[field][operator] = value;
        }
        const value = Object.keys(filters).length ? JSON.stringify(filters) : "";
        if (this.filtersControl.value !== value) {
            this.filtersControl.value = value;
            this.filtersControl.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    get source() {
        return this.querySelector('[cms-source-id="offers"]');
    }

    get offsetControl() {
        return this.querySelector('[name="mossaOfferOffset"]');
    }

    get filtersControl() {
        return this.querySelector('[name="mossaOfferFilters"]');
    }

    get offset() {
        return nonNegativeInteger(this.offsetControl.value);
    }
}

function nonNegativeInteger(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferList);
