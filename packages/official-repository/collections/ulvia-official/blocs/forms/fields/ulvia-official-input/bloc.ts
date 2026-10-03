import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

const DATE_INPUT_TYPES = new Set(["date", "datetime-local", "month", "time", "week"]);

export class Bloc extends Component {
    private input: HTMLInputElement | null = null;
    private slotElement: HTMLSlotElement | null;
    private dateIndicator: HTMLElement | null;
    private observer = new MutationObserver(() => this.syncState());

    constructor() {
        super({ css, template });
        this.slotElement = this.shadowRoot?.querySelector("slot") ?? null;
        this.dateIndicator = this.shadowRoot?.querySelector('[part="date-indicator"]') ?? null;
    }

    override connectedCallback(): void {
        this.slotElement?.addEventListener("slotchange", this.bindInput);
        this.dateIndicator?.addEventListener("click", this.openDatePicker);
        this.bindInput();
    }

    disconnectedCallback(): void {
        this.slotElement?.removeEventListener("slotchange", this.bindInput);
        this.dateIndicator?.removeEventListener("click", this.openDatePicker);
        this.observer.disconnect();
    }

    private bindInput = (): void => {
        this.observer.disconnect();
        this.input = this.querySelector<HTMLInputElement>(":scope > input");
        if (this.input) {
            this.observer.observe(this.input, {
                attributes: true,
                attributeFilter: ["disabled", "type"],
            });
        }
        this.syncState();
    };

    private syncState(): void {
        this.toggleAttribute("data-date", DATE_INPUT_TYPES.has(this.input?.type ?? ""));
        this.toggleAttribute("data-disabled", this.input?.disabled === true);
    }

    private openDatePicker = (): void => {
        if (!this.input || this.input.disabled || this.input.readOnly) {
            return;
        }
        this.input.focus({ preventScroll: true });
        try {
            this.input.showPicker();
        } catch {
            this.input.click();
        }
    };
}
