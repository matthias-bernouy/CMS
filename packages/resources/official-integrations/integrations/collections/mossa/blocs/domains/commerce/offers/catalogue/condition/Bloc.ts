import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["code", "label", "size", "tone", "variant"];
    constructor() {
        super({
            css: ":host { display: inline-flex; }",
            template: '<mossa-badge shape="pill"></mossa-badge>',
        });
    }
    override connectedCallback(): void {
        this.render();
    }
    attributeChangedCallback(): void {
        this.render();
    }
    private render() {
        const badge = this.shadowRoot?.querySelector<HTMLElement>("mossa-badge");
        if (!badge) {
            return;
        }
        badge.textContent = this.getAttribute("label")?.trim() || humanizeCode(this.getAttribute("code"));
        for (const attribute of ["size", "tone", "variant"]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                badge.setAttribute(attribute, value);
            } else {
                badge.removeAttribute(attribute);
            }
        }
    }
}

function humanizeCode(value: string | null): string {
    const words = (value || "").trim().replaceAll(/[_-]+/g, " ");
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}
