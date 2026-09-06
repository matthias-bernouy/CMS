import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class MossaPagination extends Component {
    static observedAttributes = [
        "appearance",
        "justify",
        "next-label",
        "page",
        "page-size",
        "previous-label",
        "summary",
        "summary-template",
        "tone",
        "total",
    ];

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this.previousButton.addEventListener("click", this.onPrevious);
        this.nextButton.addEventListener("click", this.onNext);
        this.sync();
    }

    disconnectedCallback() {
        this.previousButton.removeEventListener("click", this.onPrevious);
        this.nextButton.removeEventListener("click", this.onNext);
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    get page() {
        return positiveInteger(this.getAttribute("page"), 1);
    }

    set page(value) {
        this.setAttribute("page", String(value));
    }

    get pageSize() {
        return positiveInteger(this.getAttribute("page-size"), 12);
    }

    get total() {
        return nonNegativeInteger(this.getAttribute("total"), 0);
    }

    get pageCount() {
        return Math.max(1, Math.ceil(this.total / this.pageSize));
    }

    sync() {
        const page = Math.min(this.page, this.pageCount);
        if (page !== this.page) {
            this.page = page;
            return;
        }
        this.previousButton.textContent = this.getAttribute("previous-label") || "Previous";
        this.nextButton.textContent = this.getAttribute("next-label") || "Next";
        this.previousButton.toggleAttribute("disabled", page <= 1);
        this.nextButton.toggleAttribute("disabled", page >= this.pageCount || this.total === 0);
        this.summaryElement.textContent = (this.getAttribute("summary-template") || "Page {page} of {pages}")
            .replaceAll("{page}", String(page))
            .replaceAll("{pages}", String(this.pageCount))
            .replaceAll("{total}", String(this.total));
        this.style.setProperty("--_mossa-pagination-justify", justifyValue(this.getAttribute("justify")));
        for (const button of [this.previousButton, this.nextButton]) {
            copyAttribute(this, button.closest("mossa-button"), "appearance", "outlined");
            copyAttribute(this, button.closest("mossa-button"), "tone", "primary");
        }
    }

    changePage(page) {
        const nextPage = Math.min(Math.max(page, 1), this.pageCount);
        if (nextPage === this.page) {
            return;
        }
        this.page = nextPage;
        this.dispatchEvent(
            new CustomEvent("mossa-pagination:change", {
                bubbles: true,
                composed: true,
                detail: {
                    page: nextPage,
                    limit: this.pageSize,
                    offset: (nextPage - 1) * this.pageSize,
                },
            }),
        );
    }

    onPrevious = () => this.changePage(this.page - 1);
    onNext = () => this.changePage(this.page + 1);

    get previousButton() {
        return this.shadowRoot.querySelector("[data-previous]");
    }
    get nextButton() {
        return this.shadowRoot.querySelector("[data-next]");
    }
    get summaryElement() {
        return this.shadowRoot.querySelector("[data-summary]");
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

function justifyValue(value) {
    if (value === "start") {
        return "flex-start";
    }
    if (value === "center") {
        return "center";
    }
    if (value === "end") {
        return "flex-end";
    }
    return "space-between";
}

function copyAttribute(source, target, name, fallback) {
    target.setAttribute(name, source.getAttribute(name)?.trim() || fallback);
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaPagination);
