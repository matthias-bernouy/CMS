import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class Panel extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this._syncHeaderVisibility();
    }

    private _syncHeaderVisibility(): void {
        const title = this.querySelector("[slot='title']");
        const action = this.querySelector("[slot='action']");
        this.toggleAttribute("has-header", Boolean(title || action));
    }
}

if (!customElements.get("cms-editor-v2-panel")) {
    customElements.define("cms-editor-v2-panel", Panel);
}
