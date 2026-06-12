import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class TextInput extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.shadowRoot!.querySelector(".label")!.textContent = this.getAttribute("label") ?? "";
        this.shadowRoot!.querySelector(".hint")!.textContent = this.getAttribute("hint") ?? "";
        const input = this.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        input.value = this.getAttribute("value") ?? "";
        input.placeholder = this.getAttribute("placeholder") ?? "";
    }
}

if (!customElements.get("cms-editor-v2-text-input")) {
    customElements.define("cms-editor-v2-text-input", TextInput);
}
