import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class Select extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.shadowRoot!.querySelector(".label")!.textContent = this.getAttribute("label") ?? "";
        this.shadowRoot!.querySelector(".hint")!.textContent = this.getAttribute("hint") ?? "";
        const current = this.getAttribute("value");
        const options = (this.getAttribute("options") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
        this.shadowRoot!.querySelector("select")!.replaceChildren(...options.map((option) => {
            const element = document.createElement("option");
            element.textContent = option;
            element.selected = option === current;
            return element;
        }));
    }
}

if (!customElements.get("cms-editor-v2-select")) {
    customElements.define("cms-editor-v2-select", Select);
}
