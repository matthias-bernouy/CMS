import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import { attachFieldShadow, createFieldTemplate } from "../fieldElement";

const template = createFieldTemplate(templateHtml, componentCss);

export class Section extends HTMLElement {
    private readonly toggle = (): void => {
        const collapsed = this.toggleAttribute("collapsed");
        this.shadowRoot!.querySelector("button")!.ariaExpanded = String(!collapsed);
    };

    constructor() {
        super();
        attachFieldShadow(this, template);
    }

    connectedCallback(): void {
        this.shadowRoot!.querySelector(".label")!.textContent = this.getAttribute("label") ?? "";
        this.shadowRoot!.querySelector("button")!.addEventListener("click", this.toggle);
    }

    disconnectedCallback(): void {
        this.shadowRoot!.querySelector("button")!.removeEventListener("click", this.toggle);
    }
}

if (!customElements.get("cms-editor-v2-section")) {
    customElements.define("cms-editor-v2-section", Section);
}
