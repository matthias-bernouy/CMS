import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type CanvasFrameReadyDetail = {
    document: Document;
    frame: HTMLIFrameElement;
    url: string;
};

export const CANVAS_FRAME_READY_EVENT = "editor-v2:frame-ready";
export const CANVAS_BACKGROUND_CLICK_EVENT = "editor-v2:canvas-background-click";

export class Canvas extends HTMLElement {
    private _currentFrameUrl: string | null = null;

    static get observedAttributes(): string[] {
        return ["max-width", "viewport-width", "viewport-height", "frame-url", "viewport-padding", "viewport-fit"];
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.frame.addEventListener("load", this.onFrameLoad);
        this.shadowRoot!.addEventListener("click", this.onBackgroundClick);
        this.syncViewportSize();
        this.syncFrameUrl();
    }

    disconnectedCallback(): void {
        this.frame.removeEventListener("load", this.onFrameLoad);
        this.shadowRoot!.removeEventListener("click", this.onBackgroundClick);
    }

    attributeChangedCallback(name: string): void {
        if (name === "frame-url") {
            this.syncFrameUrl();
            return;
        }

        this.syncViewportSize();
    }

    private readonly onFrameLoad = (): void => {
        const frameDocument = this.frame.contentDocument;
        if (!frameDocument) return;

        this.dispatchEvent(new CustomEvent<CanvasFrameReadyDetail>(CANVAS_FRAME_READY_EVENT, {
            bubbles: true,
            composed: true,
            detail: {
                document: frameDocument,
                frame:    this.frame,
                url:      this._currentFrameUrl ?? this.frame.src,
            },
        }));
    };

    private readonly onBackgroundClick = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest(".page")) return;

        this.dispatchEvent(new CustomEvent(CANVAS_BACKGROUND_CLICK_EVENT, {
            bubbles: true,
            composed: true,
        }));
    };

    private syncFrameUrl(): void {
        const url = this.getAttribute("frame-url")?.trim() || "about:blank";
        if (this._currentFrameUrl === url) return;

        this._currentFrameUrl = url;
        if (this.frame.contentWindow) {
            this.frame.contentWindow.location.replace(url);
        } else {
            this.frame.setAttribute("src", url);
        }
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

    private cssSize(value: string | null): string | null {
        const size = value?.trim();
        if (!size) return null;
        return /^\d+$/.test(size) ? `${size}px` : size;
    }

    private get frame(): HTMLIFrameElement {
        return this.shadowRoot!.querySelector("iframe")!;
    }
}

if (!customElements.get("cms-editor-v2-canvas")) {
    customElements.define("cms-editor-v2-canvas", Canvas);
}
