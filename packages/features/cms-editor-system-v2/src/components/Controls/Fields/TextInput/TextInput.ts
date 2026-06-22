import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import { attachFieldShadow, createFieldTemplate, syncFieldCopy } from "../fieldElement";

const template = createFieldTemplate(templateHtml, componentCss);

export class TextInput extends HTMLElement {
    constructor() {
        super();
        attachFieldShadow(this, template);
    }

    connectedCallback(): void {
        syncFieldCopy(this);
        const input = this.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        input.value = this.getAttribute("value") ?? "";
        input.placeholder = this.getAttribute("placeholder") ?? "";
    }
}

if (!customElements.get("cms-editor-v2-text-input")) {
    customElements.define("cms-editor-v2-text-input", TextInput);
}
