import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private input: HTMLInputElement | null = null;
    private value: HTMLElement | null;
    private action: HTMLElement | null;
    private observer = new MutationObserver(() => this.sync());

    static get observedAttributes(): string[] {
        return ["action-label"];
    }

    constructor() {
        super({ css, template });
        this.value = this.shadowRoot?.querySelector('[part="value"]') ?? null;
        this.action = this.shadowRoot?.querySelector('[part="action"]') ?? null;
    }

    override connectedCallback(): void {
        this.input = this.querySelector<HTMLInputElement>('input[type="color"]');
        this.input?.addEventListener("input", this.sync);
        this.input?.addEventListener("change", this.sync);
        if (this.input) {
            this.observer.observe(this.input, { attributes: true, attributeFilter: ["value", "disabled"] });
        }
        this.sync();
    }

    disconnectedCallback(): void {
        this.input?.removeEventListener("input", this.sync);
        this.input?.removeEventListener("change", this.sync);
        this.observer.disconnect();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private sync = (): void => {
        const color = this.input?.value || "#3157d5";
        this.style.setProperty("--selected-color", color);
        if (this.value) {
            this.value.textContent = color;
        }
        if (this.action) {
            this.action.textContent = this.getAttribute("action-label") || "Change";
        }
        this.toggleAttribute("data-disabled", this.input?.disabled === true);
    };
}
