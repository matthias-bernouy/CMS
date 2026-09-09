import { Component } from "@bernouy/components/base";
import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import { productValuation, readProducts } from "../presentation";

type StatefulElement = HTMLElement & { value?: string };

export class ValuationController extends Component {
    static observedAttributes = ["currency", "valuation-maximum-field", "valuation-minimum-field"];

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.source, (data) => ({ selectedProduct: this.selectedProduct(data) }));
        this.addEventListener("click", this.onClick);
        this.addEventListener("input", this.onSearchInput);
        this.ownerDocument.addEventListener("cms-state:change", this.onStateChange);
        this.syncSelection();
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("input", this.onSearchInput);
        this.ownerDocument.removeEventListener("cms-state:change", this.onStateChange);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.source);
        }
    }

    private readonly onClick = (event: Event): void => {
        const button =
            event.target instanceof Element
                ? event.target.closest<HTMLButtonElement>('button[role="option"][value]')
                : null;
        if (!button?.value) {
            return;
        }
        this.setSelection(button.value);
    };

    private readonly onSearchInput = (event: Event): void => {
        if (event.target === this.querySelector('[cms-page-state="mossaValuationQuery"]')) {
            this.setSelection("");
        }
    };

    private readonly onStateChange = (): void => {
        this.syncSelection();
        refreshSourceContext(this.source);
    };

    private setSelection(value: string): void {
        const control = this.selectionControl;
        if (control.value === value) {
            return;
        }
        control.value = value;
        control.dispatchEvent(new Event("change", { bubbles: true }));
        this.syncSelection();
        refreshSourceContext(this.source);
    }

    private syncSelection(): void {
        for (const button of this.querySelectorAll<HTMLButtonElement>('button[role="option"][value]')) {
            button.setAttribute("aria-selected", String(button.value === this.selectionControl.value));
        }
    }

    private selectedProduct(data: unknown): Record<string, unknown> | null {
        const selected = readProducts(data).find((product) => product.id === this.selectionControl.value);
        if (!selected) {
            return null;
        }
        const valuation = productValuation(selected.metadata, this.minimumField, this.maximumField);
        return {
            ...selected,
            currency: (this.getAttribute("currency")?.trim() || "USD").toUpperCase(),
            hasValuation: valuation !== null,
            minimumMinor: valuation ? Math.round(valuation.minimum * 100) : null,
            maximumMinor: valuation ? Math.round(valuation.maximum * 100) : null,
        };
    }

    private get source(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="products"]')!;
    }

    private get selectionControl(): StatefulElement {
        return this.querySelector<StatefulElement>('[cms-page-state="mossaValuationProduct"]')!;
    }

    private get minimumField(): string {
        return this.getAttribute("valuation-minimum-field")?.trim() || "valuationMinimum";
    }

    private get maximumField(): string {
        return this.getAttribute("valuation-maximum-field")?.trim() || "valuationMaximum";
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", ValuationController);
