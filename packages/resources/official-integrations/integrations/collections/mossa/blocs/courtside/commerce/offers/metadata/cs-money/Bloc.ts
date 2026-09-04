import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["amount", "currency"];
    constructor() {
        super({ css: ":host{display:inline}", template: "<span></span>" });
    }
    override connectedCallback(): void {
        this.render();
    }
    attributeChangedCallback(): void {
        this.render();
    }
    private render() {
        const amount = Number(this.getAttribute("amount"));
        const currency = (this.getAttribute("currency") || "eur").toUpperCase();
        const output = this.shadowRoot?.querySelector("span");
        if (output) {
            output.textContent = Number.isFinite(amount)
                ? new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(
                      amount / 100,
                  )
                : "";
        }
    }
}
