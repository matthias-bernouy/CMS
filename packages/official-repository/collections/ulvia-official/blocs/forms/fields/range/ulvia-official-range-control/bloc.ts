import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private rangeInput: HTMLInputElement | null = null;
    private manualInput: HTMLInputElement | null = null;
    private manualLabel: HTMLElement | null = null;
    private rangeElement: HTMLElement | null = null;
    private fieldValue: HTMLElement | null = null;
    private root: Document | ShadowRoot | null = null;
    private observer = new MutationObserver(() => this.sync());

    static get observedAttributes(): string[] {
        return ["value-label", "value-placement"];
    }

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.rangeInput = this.querySelector<HTMLInputElement>('input[type="range"]');
        this.manualInput = this.querySelector<HTMLInputElement>("[data-range-manual]");
        this.manualLabel = this.querySelector<HTMLElement>("[data-range-label]");
        this.rangeElement = this.querySelector<HTMLElement>("ulvia-official-range");
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.rangeInput?.addEventListener("input", this.sync);
        this.rangeInput?.addEventListener("change", this.sync);
        this.root.addEventListener("reset", this.handleReset);
        this.manualInput?.addEventListener("input", this.handleManualInput);
        this.manualInput?.addEventListener("change", this.handleManualChange);
        if (this.rangeInput) {
            this.observer.observe(this.rangeInput, {
                attributes: true,
                attributeFilter: ["min", "max", "step", "value", "disabled"],
            });
        }
        if (this.rangeElement) {
            this.observer.observe(this.rangeElement, {
                attributes: true,
                attributeFilter: ["hide-value", "value-prefix", "value-suffix"],
            });
        }
        this.sync();
    }

    disconnectedCallback(): void {
        this.rangeInput?.removeEventListener("input", this.sync);
        this.rangeInput?.removeEventListener("change", this.sync);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.manualInput?.removeEventListener("input", this.handleManualInput);
        this.manualInput?.removeEventListener("change", this.handleManualChange);
        this.observer.disconnect();
        this.clearFieldValue();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private handleManualInput = (): void => {
        this.commitManualValue("input");
    };

    private handleManualChange = (): void => {
        this.commitManualValue("change");
    };

    private commitManualValue(type: "input" | "change"): void {
        if (!this.rangeInput || !this.manualInput || this.rangeInput.disabled) {
            return;
        }
        const value = Number(this.manualInput.value);
        if (!Number.isFinite(value)) {
            return;
        }
        this.rangeInput.value = String(value);
        this.rangeInput.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
        this.sync();
    }

    private sync = (): void => {
        if (!this.rangeInput || !this.manualInput) {
            return;
        }
        this.manualInput.min = this.rangeInput.min;
        this.manualInput.max = this.rangeInput.max;
        this.manualInput.step = this.rangeInput.step || "1";
        this.manualInput.value = this.rangeInput.value;
        this.manualInput.disabled = this.rangeInput.disabled;
        const valueLabel = this.getAttribute("value-label") || "Value";
        this.manualInput.setAttribute("aria-label", valueLabel);
        if (this.manualLabel) {
            this.manualLabel.textContent = valueLabel;
        }
        this.syncFieldValue();
    };

    private syncFieldValue(): void {
        const placeInField = this.getAttribute("value-placement") === "field";
        this.toggleAttribute("data-field-value", placeInField);
        if (!placeInField || !this.rangeInput || !this.rangeElement) {
            this.clearFieldValue();
            return;
        }
        const fieldValue = this.closest("ulvia-official-field")?.querySelector<HTMLElement>("[data-field-value]");
        if (!fieldValue) {
            return;
        }
        if (this.fieldValue && this.fieldValue !== fieldValue) {
            this.clearFieldValue();
        }
        this.fieldValue = fieldValue;
        fieldValue.textContent = `${this.rangeElement.getAttribute("value-prefix") ?? ""}${this.rangeInput.value}${this.rangeElement.getAttribute("value-suffix") ?? ""}`;
        fieldValue.toggleAttribute("hidden", this.rangeElement.hasAttribute("hide-value"));
    }

    private clearFieldValue(): void {
        if (this.fieldValue) {
            this.fieldValue.hidden = true;
            this.fieldValue.textContent = "";
            this.fieldValue = null;
        }
    }

    private handleReset = (event: Event): void => {
        if (event.target !== this.rangeInput?.form) {
            return;
        }
        window.setTimeout(this.sync);
    };
}
