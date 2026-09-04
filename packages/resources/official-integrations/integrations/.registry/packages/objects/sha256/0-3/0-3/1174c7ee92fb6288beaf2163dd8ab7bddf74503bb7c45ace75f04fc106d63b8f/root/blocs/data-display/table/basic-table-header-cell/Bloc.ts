import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class BasicTableHeaderCell extends Component {
    static observedAttributes = ["filter-name", "filter-placeholder", "sort"];

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this.sortTrigger.addEventListener("click", this.onSort);
        this.filterButton.addEventListener("click", this.onFilterToggle);
        this.filterPopover.addEventListener("click", this.stopPropagation);
        this.filterInput.addEventListener("keydown", this.onFilterKeydown);
        window.addEventListener("click", this.closeFilter);
        this.sync();
    }

    disconnectedCallback() {
        this.sortTrigger.removeEventListener("click", this.onSort);
        this.filterButton.removeEventListener("click", this.onFilterToggle);
        this.filterPopover.removeEventListener("click", this.stopPropagation);
        this.filterInput.removeEventListener("keydown", this.onFilterKeydown);
        window.removeEventListener("click", this.closeFilter);
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    sync() {
        if (!this.hasAttribute("role")) {
            this.setAttribute("role", "columnheader");
        }
        const url = new URL(window.location.href);
        const sort = this.getAttribute("sort")?.trim();
        const direction = sort === url.searchParams.get("sort") ? url.searchParams.get("direction") : null;
        this.setAttribute(
            "aria-sort",
            direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none",
        );

        const filterName = this.getAttribute("filter-name")?.trim();
        this.filterButton.toggleAttribute("hidden", !filterName);
        this.filterInput.placeholder = this.getAttribute("filter-placeholder") || "Filter...";
        this.filterInput.value = filterName ? (url.searchParams.get(`f_${filterName}`) ?? "") : "";
        this.toggleAttribute("data-has-filter", Boolean(this.filterInput.value));
    }

    applySort() {
        const sort = this.getAttribute("sort")?.trim();
        if (!sort) {
            return;
        }
        const url = new URL(window.location.href);
        const direction =
            url.searchParams.get("sort") === sort && url.searchParams.get("direction") === "asc" ? "desc" : "asc";
        url.searchParams.set("sort", sort);
        url.searchParams.set("direction", direction);
        this.navigate(url);
    }

    applyFilter() {
        const filterName = this.getAttribute("filter-name")?.trim();
        if (!filterName) {
            return;
        }
        const url = new URL(window.location.href);
        const value = this.filterInput.value.trim();
        if (value) {
            url.searchParams.set(`f_${filterName}`, value);
        } else {
            url.searchParams.delete(`f_${filterName}`);
        }
        this.navigate(url);
    }

    navigate(url) {
        this.navigationAnchor.href = url.toString();
        this.navigationAnchor.click();
    }

    onSort = (event) => {
        if (!event.composedPath().includes(this.filterButton)) {
            this.applySort();
        }
    };

    onFilterToggle = (event) => {
        event.stopPropagation();
        const open = this.filterPopover.hasAttribute("hidden");
        this.filterPopover.toggleAttribute("hidden", !open);
        this.filterButton.setAttribute("aria-expanded", String(open));
        if (open) {
            this.filterInput.focus();
        }
    };

    onFilterKeydown = (event) => {
        if (event.key === "Enter") {
            this.applyFilter();
        }
    };

    closeFilter = () => {
        this.filterPopover.setAttribute("hidden", "");
        this.filterButton.setAttribute("aria-expanded", "false");
    };

    stopPropagation = (event) => event.stopPropagation();

    get sortTrigger() {
        return this.shadowRoot.querySelector("[data-sort]");
    }
    get filterButton() {
        return this.shadowRoot.querySelector("[data-filter-toggle]");
    }
    get filterPopover() {
        return this.shadowRoot.querySelector("[data-filter-popover]");
    }
    get filterInput() {
        return this.shadowRoot.querySelector("input");
    }
    get navigationAnchor() {
        return this.shadowRoot.querySelector("[data-navigation]");
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicTableHeaderCell);
