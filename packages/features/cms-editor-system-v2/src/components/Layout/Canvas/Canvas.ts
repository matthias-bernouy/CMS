import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type CanvasFrameReadyDetail = {
    document: Document;
    frame: HTMLIFrameElement;
    kind: CanvasFrameKind;
    url: string;
};

export type CanvasFrameKind = "editor" | "view";

export const CANVAS_FRAME_READY_EVENT = "editor-v2:frame-ready";
export const CANVAS_BACKGROUND_CLICK_EVENT = "editor-v2:canvas-background-click";

export class Canvas extends HTMLElement {
    private readonly _currentFrameUrls: Record<CanvasFrameKind, string | null> = {
        editor: null,
        view:   null,
    };

    static get observedAttributes(): string[] {
        return [
            "max-width",
            "viewport-width",
            "viewport-height",
            "frame-url",
            "editor-frame-url",
            "view-frame-url",
            "mode",
            "viewport-padding",
            "viewport-fit",
        ];
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.editorFrame.addEventListener("load", this.onFrameLoad);
        this.viewFrame.addEventListener("load", this.onFrameLoad);
        this.shadowRoot!.addEventListener("click", this.onBackgroundClick);
        this.syncViewportSize();
        this.syncFrameUrls();
    }

    disconnectedCallback(): void {
        this.editorFrame.removeEventListener("load", this.onFrameLoad);
        this.viewFrame.removeEventListener("load", this.onFrameLoad);
        this.shadowRoot!.removeEventListener("click", this.onBackgroundClick);
    }

    reloadViewFrame(): void {
        const url = this.viewFrameUrl();
        if (this.viewFrame.contentWindow) {
            this.viewFrame.contentWindow.location.replace(url);
        } else {
            this.viewFrame.setAttribute("src", url);
        }
    }

    attributeChangedCallback(name: string): void {
        if (name === "frame-url" || name === "editor-frame-url" || name === "view-frame-url") {
            this.syncFrameUrls();
            return;
        }

        if (name === "mode") return;

        this.syncViewportSize();
    }

    private readonly onFrameLoad = (event: Event): void => {
        const frame = event.currentTarget;
        if (!(frame instanceof HTMLElement) || frame.localName !== "iframe") return;

        const iframe = frame as HTMLIFrameElement;
        const kind = iframe.dataset.frameKind === "view" ? "view" : "editor";
        const frameDocument = iframe.contentDocument;
        if (!frameDocument) return;

        this.dispatchEvent(new CustomEvent<CanvasFrameReadyDetail>(CANVAS_FRAME_READY_EVENT, {
            bubbles: true,
            composed: true,
            detail: {
                document: frameDocument,
                frame: iframe,
                kind,
                url:      this._currentFrameUrls[kind] ?? iframe.src,
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

    private syncFrameUrls(): void {
        this.syncFrameUrl("editor", this.editorFrame, this.editorFrameUrl());
        this.syncFrameUrl("view", this.viewFrame, this.viewFrameUrl());
    }

    private syncFrameUrl(kind: CanvasFrameKind, frame: HTMLIFrameElement, url: string): void {
        if (this._currentFrameUrls[kind] === url) return;

        this._currentFrameUrls[kind] = url;
        if (frame.contentWindow) {
            frame.contentWindow.location.replace(url);
        } else {
            frame.setAttribute("src", url);
        }
    }

    private editorFrameUrl(): string {
        return this.getAttribute("editor-frame-url")?.trim()
            || this.getAttribute("frame-url")?.trim()
            || "about:blank";
    }

    private viewFrameUrl(): string {
        return this.getAttribute("view-frame-url")?.trim()
            || this.getAttribute("frame-url")?.trim()
            || "about:blank";
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

    private get editorFrame(): HTMLIFrameElement {
        return this.shadowRoot!.querySelector(".editor-frame")!;
    }

    private get viewFrame(): HTMLIFrameElement {
        return this.shadowRoot!.querySelector(".view-frame")!;
    }
}

if (!customElements.get("cms-editor-v2-canvas")) {
    customElements.define("cms-editor-v2-canvas", Canvas);
}
