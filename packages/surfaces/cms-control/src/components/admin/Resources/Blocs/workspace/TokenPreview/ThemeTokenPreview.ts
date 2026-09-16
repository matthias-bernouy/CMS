import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

const TOKEN_TYPES = new Set(["color", "font-family", "length", "number", "shadow", "value"]);

export class CmsThemeTokenPreview extends Component {
    private readonly lightColor: HTMLElement;
    private readonly darkColor: HTMLElement;
    private readonly glyph: HTMLElement;
    private readonly measure: HTMLElement;
    private readonly surface: HTMLElement;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        this.lightColor = this.shadowRoot!.querySelector(".color-light")!;
        this.darkColor = this.shadowRoot!.querySelector(".color-dark")!;
        this.glyph = this.shadowRoot!.querySelector(".glyph")!;
        this.measure = this.shadowRoot!.querySelector(".measure-value")!;
        this.surface = this.shadowRoot!.querySelector(".surface")!;
    }

    static get observedAttributes(): string[] {
        return ["type", "light", "dark"];
    }

    override connectedCallback(): void {
        this.setAttribute("aria-hidden", "true");
        this.sync();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private sync(): void {
        const requestedType = this.getAttribute("type") ?? "value";
        const type = TOKEN_TYPES.has(requestedType) ? requestedType : "value";
        const light = this.getAttribute("light")?.trim() ?? "";
        const dark = this.getAttribute("dark")?.trim() || light;
        this.dataset.type = type;
        this.lightColor.style.background = light;
        this.darkColor.style.background = dark;
        this.surface.style.boxShadow = type === "shadow" ? light : "";
        this.glyph.style.fontFamily = type === "font-family" ? light : "";
        this.glyph.textContent = glyphFor(type, light);
        this.measure.style.width = type === "length" ? light : "";
    }
}

function glyphFor(type: string, value: string): string {
    if (type === "font-family") {
        return "Aa";
    }
    if (type === "number") {
        return value || "1.0";
    }
    return type === "value" ? "••" : "";
}

if (!customElements.get("cms-theme-token-preview")) {
    customElements.define("cms-theme-token-preview", CmsThemeTokenPreview);
}
