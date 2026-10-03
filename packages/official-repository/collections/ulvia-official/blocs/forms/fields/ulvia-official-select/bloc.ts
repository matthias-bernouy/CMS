import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type SelectWithPicker = HTMLSelectElement & { showPicker?: () => void };

export class Bloc extends Component {
    private select: HTMLSelectElement | null = null;
    private slotElement: HTMLSlotElement | null;
    private indicator: HTMLElement | null;

    constructor() {
        super({ css, template });
        this.slotElement = this.shadowRoot?.querySelector("slot") ?? null;
        this.indicator = this.shadowRoot?.querySelector('[part="indicator"]') ?? null;
    }

    override connectedCallback(): void {
        this.slotElement?.addEventListener("slotchange", this.bindSelect);
        this.indicator?.addEventListener("click", this.openSelect);
        this.bindSelect();
    }

    disconnectedCallback(): void {
        this.slotElement?.removeEventListener("slotchange", this.bindSelect);
        this.indicator?.removeEventListener("click", this.openSelect);
    }

    private bindSelect = (): void => {
        this.select = this.querySelector<HTMLSelectElement>(":scope > select");
    };

    private openSelect = (): void => {
        if (!this.select || this.select.disabled) {
            return;
        }
        this.select.focus({ preventScroll: true });
        const select = this.select as SelectWithPicker;
        try {
            if (select.showPicker) {
                select.showPicker();
            } else {
                select.click();
            }
        } catch {
            select.click();
        }
    };
}
