import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    static observedAttributes = ["category-param", "first-category-value", "second-category-value"];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.addEventListener("change", this.onChange, true);
        this.addEventListener("click", this.onCategoryClick);
        this.addEventListener("mossa-chip:toggle", this.onChipToggle, true);
        this.addEventListener("category-filters-reset", this.onManagedReset);
        this.ownerDocument.addEventListener("cms-params:change", this.sync);
        this.ownerDocument.defaultView?.addEventListener("popstate", this.sync);
        this.sync();
    }

    disconnectedCallback(): void {
        this.removeEventListener("change", this.onChange, true);
        this.removeEventListener("click", this.onCategoryClick);
        this.removeEventListener("mossa-chip:toggle", this.onChipToggle, true);
        this.removeEventListener("category-filters-reset", this.onManagedReset);
        this.ownerDocument.removeEventListener("cms-params:change", this.sync);
        this.ownerDocument.defaultView?.removeEventListener("popstate", this.sync);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.sync();
        }
    }

    private onChipToggle = (event: Event): void => {
        const chip = event
            .composedPath()
            .find((node) => node instanceof HTMLElement && node.tagName === "MOSSA-CHIP") as HTMLElement | undefined;
        const group = chip?.parentElement as (HTMLElement & { value?: string }) | null;
        if (
            !chip?.hasAttribute("selected") ||
            group?.tagName !== "MOSSA-CHIP-GROUP" ||
            group.getAttribute("mode") === "multiple"
        ) {
            return;
        }

        event.stopPropagation();
        group.value = "";
        group.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };

    private onCategoryClick = (event: Event): void => {
        const button = event
            .composedPath()
            .find((node) => node instanceof HTMLElement && node.matches("mossa-button[data-category-value]")) as
            | HTMLElement
            | undefined;
        if (!button || typeof location === "undefined" || typeof history === "undefined") {
            return;
        }

        const params = new URLSearchParams(location.search);
        this.managedFilterParams.forEach((param) => params.delete(param));
        params.set(this.categoryParam, button.getAttribute("data-category-value") ?? "");
        this.replaceParams(params);
        this.ownerDocument.dispatchEvent(new Event("cms-params:change"));
    };

    private onManagedReset = (): void => {
        if (typeof location === "undefined" || typeof history === "undefined") {
            return;
        }
        const params = new URLSearchParams(location.search);
        params.delete(this.categoryParam);
        params.delete("priceMin");
        params.delete("priceMax");
        this.managedFilterParams.forEach((param) => params.delete(param));
        this.replaceParams(params);
        this.ownerDocument.dispatchEvent(new Event("cms-params:change"));
    };

    private onChange = (event: Event): void => {
        const priceRange = event
            .composedPath()
            .find((node) => node instanceof HTMLElement && node.hasAttribute("data-price-filter")) as
            | HTMLElement
            | undefined;
        if (priceRange) {
            this.writePriceRange(priceRange);
            return;
        }

        const numericFilter = event
            .composedPath()
            .find((node) => node instanceof HTMLElement && node.hasAttribute("data-numeric-filter")) as
            | (HTMLElement & { value?: string })
            | undefined;
        if (numericFilter) {
            this.writeNumericFilter(numericFilter);
            return;
        }

        const control = event
            .composedPath()
            .find(
                (node) => node instanceof HTMLElement && node.getAttribute("cms-param-sync") === this.categoryParam,
            ) as (HTMLElement & { value?: string }) | undefined;
        if (!control || typeof location === "undefined" || typeof history === "undefined") {
            return;
        }

        const params = new URLSearchParams(location.search);
        this.managedFilterParams.forEach((param) => params.delete(param));
        const category = String(control.value ?? "").trim();
        if (category) {
            params.set(this.categoryParam, category);
        } else {
            params.delete(this.categoryParam);
        }
        this.replaceParams(params);
        queueMicrotask(this.sync);
    };

    private writePriceRange(control: HTMLElement): void {
        if (typeof location === "undefined" || typeof history === "undefined") {
            return;
        }
        const params = new URLSearchParams(location.search);
        const minimum = Number(control.getAttribute("min") ?? 0);
        const maximum = Number(control.getAttribute("max") ?? 500);
        const valueMin = Number(control.getAttribute("value-min") ?? minimum);
        const valueMax = Number(control.getAttribute("value-max") ?? maximum);
        if (valueMin > minimum) {
            params.set("priceMin", String(valueMin));
        } else {
            params.delete("priceMin");
        }
        if (valueMax < maximum) {
            params.set("priceMax", String(valueMax));
        } else {
            params.delete("priceMax");
        }
        this.replaceParams(params);
        this.ownerDocument.dispatchEvent(new Event("cms-params:change"));
    }

    private writeNumericFilter(control: HTMLElement & { value?: string }): void {
        if (typeof location === "undefined" || typeof history === "undefined") {
            return;
        }
        const param = control.getAttribute("cms-param-sync")?.trim();
        if (!param) {
            return;
        }
        const params = new URLSearchParams(location.search);
        const value = Number(control.value);
        const defaultValue = Number(control.getAttribute("max"));
        if (Number.isFinite(value) && (!Number.isFinite(defaultValue) || value < defaultValue)) {
            params.set(param, String(value));
        } else {
            params.delete(param);
        }
        this.replaceParams(params);
        this.ownerDocument.dispatchEvent(new Event("cms-params:change"));
    }

    private replaceParams(params: URLSearchParams): void {
        const query = params.toString();
        history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
    }

    private sync = (): void => {
        const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
        const value = params.get(this.categoryParam) ?? "";
        const mode =
            value === this.firstCategoryValue ? "first" : value === this.secondCategoryValue ? "second" : "all";

        this.setAttribute("active-category", mode);
        this.firstCategorySection.hidden = mode !== "first";
        this.secondCategorySection.hidden = mode !== "second";

        for (const button of this.querySelectorAll<HTMLElement>("mossa-button[data-category-value]")) {
            const active = button.getAttribute("data-category-value") === value;
            button.setAttribute("appearance", active ? "filled" : "outlined");
            button.style.setProperty(
                "--_mossa-button-color",
                active ? "var(--ulvia-secondary-foreground)" : "var(--ulvia-surface-text)",
            );
            button.style.setProperty(
                "--_mossa-button-background",
                active ? "var(--ulvia-secondary-base)" : "var(--ulvia-surface-background)",
            );
            button.style.setProperty(
                "--_mossa-button-border-color",
                active ? "var(--ulvia-secondary-base)" : "var(--ulvia-surface-border)",
            );
            button.style.setProperty("--_mossa-focus-color", "var(--ulvia-secondary-base)");
            button.querySelector("button")?.setAttribute("aria-pressed", String(active));
        }

        const priceRange = this.querySelector<HTMLElement>("[data-price-filter]");
        if (priceRange) {
            const minimum = Number(priceRange.getAttribute("min") ?? 0);
            const maximum = Number(priceRange.getAttribute("max") ?? 200);
            const requestedMin = Number(params.get("priceMin") ?? minimum);
            const requestedMax = Number(params.get("priceMax") ?? maximum);
            const valueMin = Math.min(maximum, Math.max(minimum, requestedMin));
            const valueMax = Math.min(maximum, Math.max(valueMin, requestedMax));
            priceRange.setAttribute("value-min", String(valueMin));
            priceRange.setAttribute("value-max", String(valueMax));
            const offerList = this.closest<HTMLElement>("mossa-commerce-offer-list");
            if (offerList) {
                if (params.has("priceMin")) {
                    offerList.setAttribute("minimum-price", String(valueMin));
                } else {
                    offerList.removeAttribute("minimum-price");
                }
                if (params.has("priceMax")) {
                    offerList.setAttribute("maximum-price", String(valueMax));
                } else {
                    offerList.removeAttribute("maximum-price");
                }
            }
        }
    };

    private get managedFilterParams(): string[] {
        const panel = this.querySelector<HTMLElement & { managedParams?: () => string[] }>(
            "mossa-commerce-offer-filter[schema-driven]",
        );
        const managed = panel?.managedParams?.() ?? [];
        const rendered = [...this.querySelectorAll<HTMLElement>("[data-filter-param]")]
            .map((control) => control.getAttribute("data-filter-param")?.trim() ?? "")
            .filter(Boolean);
        return [...new Set([...managed, ...rendered])];
    }

    private get categoryParam(): string {
        return this.getAttribute("category-param")?.trim() || "category";
    }

    private get firstCategoryValue(): string {
        return this.getAttribute("first-category-value")?.trim() || "category-a";
    }

    private get secondCategoryValue(): string {
        return this.getAttribute("second-category-value")?.trim() || "category-b";
    }

    private get firstCategorySection(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>('[data-category="first"]')!;
    }

    private get secondCategorySection(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>('[data-category="second"]')!;
    }
}
