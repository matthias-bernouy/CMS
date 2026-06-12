import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class Section extends HTMLElement {
    private readonly toggle = (): void => {
        const collapsed = this.toggleAttribute("collapsed");
        this.shadowRoot!.querySelector("button")!.ariaExpanded = String(!collapsed);
    };

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
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
