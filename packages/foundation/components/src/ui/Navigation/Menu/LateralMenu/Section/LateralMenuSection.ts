import { Component, upgradeProperty } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class LateralMenuSection extends Component {
    private readonly button: HTMLButtonElement | null;
    private readonly content: HTMLElement | null;
    private readonly countElement: HTMLElement | null;
    private readonly labelElement: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this.button = this.shadowRoot?.querySelector("button") ?? null;
        this.content = this.shadowRoot?.querySelector(".content") ?? null;
        this.countElement = this.shadowRoot?.querySelector(".count") ?? null;
        this.labelElement = this.shadowRoot?.querySelector(".label") ?? null;
    }

    static get observedAttributes(): string[] {
        return ["count", "label", "open"];
    }

    override connectedCallback(): void {
        for (const property of ["count", "label", "open"]) {
            upgradeProperty(this, property);
        }
        this.button?.addEventListener("click", this.toggle);
        this.sync();
    }

    disconnectedCallback(): void {
        this.button?.removeEventListener("click", this.toggle);
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    get count(): string {
        return this.getAttribute("count") ?? "";
    }

    set count(value: string) {
        value ? this.setAttribute("count", value) : this.removeAttribute("count");
    }

    get label(): string {
        return this.getAttribute("label") ?? "";
    }

    set label(value: string) {
        value ? this.setAttribute("label", value) : this.removeAttribute("label");
    }

    get open(): boolean {
        return this.hasAttribute("open");
    }

    set open(value: boolean) {
        this.toggleAttribute("open", value);
    }

    private readonly toggle = (): void => {
        this.open = !this.open;
    };

    private sync(): void {
        if (!this.button || !this.content || !this.countElement || !this.labelElement) {
            return;
        }
        this.labelElement.textContent = this.label;
        this.countElement.textContent = this.count;
        this.countElement.hidden = !this.count;
        this.button.setAttribute("aria-expanded", String(this.open));
        this.content.hidden = !this.open;
    }
}
