import { Component } from "@bernouy/components/base";

const labels: Record<string, string> = { very_good: "Ace", good: "Break", poor: "Coup droit" };
export class Bloc extends Component {
    static observedAttributes = ["code"];
    constructor() {
        super({
            css: ":host{display:inline-flex;padding:.3rem .7rem;border-radius:999px;background:var(--ulvia-surface-background);color:var(--ulvia-surface-text);font-size:.8rem;font-weight:800;box-shadow:var(--ulvia-shadow-sm)}",
            template: "<span></span>",
        });
    }
    override connectedCallback(): void {
        this.render();
    }
    attributeChangedCallback(): void {
        this.render();
    }
    private render() {
        const node = this.shadowRoot?.querySelector("span");
        if (node) {
            node.textContent = labels[this.getAttribute("code") || ""] || this.getAttribute("code") || "";
        }
    }
}
