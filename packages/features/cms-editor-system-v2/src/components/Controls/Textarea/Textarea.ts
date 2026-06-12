import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class Textarea extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.shadowRoot!.querySelector(".label")!.textContent = this.getAttribute("label") ?? "";
        this.shadowRoot!.querySelector(".hint")!.textContent = this.getAttribute("hint") ?? "";
        this.shadowRoot!.querySelector("textarea")!.textContent = this.getAttribute("value") ?? "";
    }
}

if (!customElements.get("cms-editor-v2-textarea")) {
    customElements.define("cms-editor-v2-textarea", Textarea);
}
