import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    static get observedAttributes(): string[] {
        return ["expanded", "count"];
    }

    private trigger: HTMLButtonElement | null = null;
    private region: HTMLElement | null = null;

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.trigger = this.querySelector(":scope > button");
        this.region = this.shadowRoot?.querySelector('[part="region"]') ?? null;
        this.trigger?.addEventListener("click", this.toggle);
        this.sync();
    }

    disconnectedCallback(): void {
        this.trigger?.removeEventListener("click", this.toggle);
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private toggle = (): void => {
        this.toggleAttribute("expanded");
    };

    private sync(): void {
        const expanded = this.hasAttribute("expanded");
        this.trigger?.setAttribute("aria-expanded", String(expanded));
        this.region?.setAttribute("aria-hidden", String(!expanded));
        if (this.region) {
            this.region.inert = !expanded;
        }

        const count = Number(this.getAttribute("count") || "0");
        if (count > 0) {
            this.trigger?.setAttribute("data-count", String(count));
        } else {
            this.trigger?.removeAttribute("data-count");
        }
    }
}
