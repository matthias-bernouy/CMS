import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["code", "label"];
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
            node.textContent = this.getAttribute("label")?.trim() || humanizeCode(this.getAttribute("code"));
        }
    }
}

function humanizeCode(value: string | null): string {
    const words = (value || "").trim().replaceAll(/[_-]+/g, " ");
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}
