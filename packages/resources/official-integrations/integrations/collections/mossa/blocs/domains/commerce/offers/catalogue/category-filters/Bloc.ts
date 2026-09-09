import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    static observedAttributes = ["first-category-value", "second-category-value"];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.addEventListener("change", this.sync);
        this.addEventListener("click", this.onCategoryClick);
        this.addEventListener("category-filters-reset", this.reset);
        this.ownerDocument.addEventListener("cms-params:change", this.sync);
        this.ownerDocument.defaultView?.addEventListener("popstate", this.sync);
        queueMicrotask(this.sync);
    }

    disconnectedCallback(): void {
        this.removeEventListener("change", this.sync);
        this.removeEventListener("click", this.onCategoryClick);
        this.removeEventListener("category-filters-reset", this.reset);
        this.ownerDocument.removeEventListener("cms-params:change", this.sync);
        this.ownerDocument.defaultView?.removeEventListener("popstate", this.sync);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.sync();
        }
    }

    private readonly onCategoryClick = (event: Event): void => {
        const button = event
            .composedPath()
            .find((node) => node instanceof HTMLButtonElement && node.name === "mossaCategory") as
            | HTMLButtonElement
            | undefined;
        if (!button) {
            return;
        }
        this.clearManagedFilters();
        this.categoryControl.value = this.categoryControl.value === button.value ? "" : button.value;
        this.categoryControl.dispatchEvent(new Event("change", { bubbles: true }));
    };

    private readonly reset = (): void => {
        this.clearManagedFilters();
        this.categoryControl.value = "";
        this.categoryControl.dispatchEvent(new Event("change", { bubbles: true }));
    };

    private clearManagedFilters(): void {
        for (const control of this.querySelectorAll<HTMLElement>("[cms-param-sync]")) {
            if (control === this.categoryControl) {
                continue;
            }
            const input = control as HTMLElement & { value?: string };
            if ("value" in input) {
                input.value = "";
                control.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
    }

    private readonly sync = (): void => {
        const value = this.categoryControl.value;
        const mode =
            value === this.firstCategoryValue ? "first" : value === this.secondCategoryValue ? "second" : "all";
        this.toggleAttribute("has-category", mode !== "all");
        this.firstCategorySection.hidden = mode !== "first";
        this.secondCategorySection.hidden = mode !== "second";
        for (const button of this.querySelectorAll<HTMLButtonElement>('button[name="mossaCategory"]')) {
            const active = button.value === value;
            button.setAttribute("aria-pressed", String(active));
            const wrapper = button.closest("mossa-button");
            wrapper?.setAttribute("appearance", active ? "filled" : "outlined");
            wrapper?.setAttribute("tone", active ? "secondary" : "neutral");
        }
    };

    private get categoryControl(): HTMLInputElement {
        return this.querySelector<HTMLInputElement>('[cms-param-sync="category"]')!;
    }

    private get firstCategoryValue(): string {
        return this.getAttribute("first-category-value")?.trim() || "category-a";
    }

    private get secondCategoryValue(): string {
        return this.getAttribute("second-category-value")?.trim() || "category-b";
    }

    private get firstCategorySection(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".first-category")!;
    }

    private get secondCategorySection(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".second-category")!;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
