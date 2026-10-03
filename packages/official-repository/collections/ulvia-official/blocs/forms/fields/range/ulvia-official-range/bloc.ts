import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private input: HTMLInputElement | null = null;
    private slotElement: HTMLSlotElement | null;
    private current: HTMLElement | null;
    private minimum: HTMLElement | null;
    private maximum: HTMLElement | null;
    private root: Document | ShadowRoot | null = null;
    private observer = new MutationObserver(() => this.sync());

    static get observedAttributes(): string[] {
        return ["value-prefix", "value-suffix"];
    }

    constructor() {
        super({ css, template });
        this.slotElement = this.shadowRoot?.querySelector("slot") ?? null;
        this.current = this.shadowRoot?.querySelector('[part="current"]') ?? null;
        this.minimum = this.shadowRoot?.querySelector('[part="minimum"]') ?? null;
        this.maximum = this.shadowRoot?.querySelector('[part="maximum"]') ?? null;
    }

    override connectedCallback(): void {
        this.slotElement?.addEventListener("slotchange", this.bindInput);
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.root.addEventListener("reset", this.handleReset);
        this.bindInput();
    }

    disconnectedCallback(): void {
        this.slotElement?.removeEventListener("slotchange", this.bindInput);
        this.input?.removeEventListener("input", this.sync);
        this.input?.removeEventListener("change", this.sync);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.observer.disconnect();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private bindInput = (): void => {
        this.input?.removeEventListener("input", this.sync);
        this.input?.removeEventListener("change", this.sync);
        this.observer.disconnect();
        this.input = this.querySelector<HTMLInputElement>(':scope > input[type="range"]');
        this.input?.addEventListener("input", this.sync);
        this.input?.addEventListener("change", this.sync);
        if (this.input) {
            this.observer.observe(this.input, {
                attributes: true,
                attributeFilter: ["min", "max", "step", "value", "disabled"],
            });
        }
        this.sync();
    };

    private sync = (): void => {
        if (!this.input) {
            return;
        }
        const minimum = Number(this.input.min || "0");
        const maximum = Number(this.input.max || "100");
        const value = Number(this.input.value);
        const fraction = maximum === minimum ? 0 : Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
        this.style.setProperty("--range-progress", `${fraction * 100}%`);
        this.style.setProperty("--range-thumb-position", `calc(${fraction * 100}% + ${0.625 - fraction * 1.25}rem)`);
        if (this.current) {
            this.current.textContent = this.formatValue(this.input.value);
        }
        if (this.minimum) {
            this.minimum.textContent = this.formatValue(this.input.min || "0");
        }
        if (this.maximum) {
            this.maximum.textContent = this.formatValue(this.input.max || "100");
        }
        this.toggleAttribute("data-disabled", this.input.disabled);
    };

    private formatValue(value: string): string {
        return `${this.getAttribute("value-prefix") ?? ""}${value}${this.getAttribute("value-suffix") ?? ""}`;
    }

    private handleReset = (event: Event): void => {
        if (event.target !== this.input?.form) {
            return;
        }
        window.setTimeout(this.sync);
    };
}
