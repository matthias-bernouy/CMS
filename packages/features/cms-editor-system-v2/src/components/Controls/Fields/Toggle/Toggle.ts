import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import { attachFieldShadow, createFieldTemplate, syncFieldCopy } from "../fieldElement";

const template = createFieldTemplate(templateHtml, componentCss);

export class Toggle extends HTMLElement {
    constructor() {
        super();
        attachFieldShadow(this, template);
    }

    connectedCallback(): void {
        syncFieldCopy(this);
        this.shadowRoot!.querySelector("button")!.ariaPressed = String(this.hasAttribute("checked"));
    }
}

if (!customElements.get("cms-editor-v2-toggle")) {
    customElements.define("cms-editor-v2-toggle", Toggle);
}
