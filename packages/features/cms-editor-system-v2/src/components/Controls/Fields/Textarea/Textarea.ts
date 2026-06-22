import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import { attachFieldShadow, createFieldTemplate, syncFieldCopy } from "../fieldElement";

const template = createFieldTemplate(templateHtml, componentCss);

export class Textarea extends HTMLElement {
    constructor() {
        super();
        attachFieldShadow(this, template);
    }

    connectedCallback(): void {
        syncFieldCopy(this);
        this.shadowRoot!.querySelector("textarea")!.value = this.getAttribute("value") ?? "";
    }
}

if (!customElements.get("cms-editor-v2-textarea")) {
    customElements.define("cms-editor-v2-textarea", Textarea);
}
