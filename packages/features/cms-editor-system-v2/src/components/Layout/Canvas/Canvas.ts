import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import frameDocumentHtml from "./frameDocument.html" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class Canvas extends HTMLElement {
    static get observedAttributes(): string[] {
        return ["max-width", "viewport-width", "viewport-height"];
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.syncViewportSize();
        this.syncFrameDocument();
    }

    attributeChangedCallback(): void {
        this.syncViewportSize();
        this.syncFrameDocument();
    }

    private syncViewportSize(): void {
        const width = this.cssSize(this.getAttribute("viewport-width") ?? this.getAttribute("max-width"));
        const height = this.cssSize(this.getAttribute("viewport-height"));
        if (width) {
            this.style.setProperty("--editor-v2-viewport-width", width);
        } else {
            this.style.removeProperty("--editor-v2-viewport-width");
        }
        if (height) {
            this.style.setProperty("--editor-v2-viewport-height", height);
        } else {
            this.style.removeProperty("--editor-v2-viewport-height");
        }
    }

    private syncFrameDocument(): void {
        const frame = this.shadowRoot?.querySelector<HTMLIFrameElement>("iframe");
        if (!frame) return;
        frame.srcdoc = String(frameDocumentHtml);
    }

    private cssSize(value: string | null): string | null {
        const size = value?.trim();
        if (!size) return null;
        return /^\d+$/.test(size) ? `${size}px` : size;
    }
}

if (!customElements.get("cms-editor-v2-canvas")) {
    customElements.define("cms-editor-v2-canvas", Canvas);
}
