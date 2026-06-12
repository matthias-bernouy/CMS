import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class SchemaPicker extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.shadowRoot!.querySelector("strong")!.textContent = this.getAttribute("source") ?? "Plans data";
        this.shadowRoot!.querySelector("code")!.textContent = this.getAttribute("path") ?? "urn:supabase:listPlans";
    }
}

if (!customElements.get("cms-editor-v2-schema-picker")) {
    customElements.define("cms-editor-v2-schema-picker", SchemaPicker);
}
