import { editableContentTargets } from "./document/content";
import type { EditablePageDocument } from "./document/index";
import { authoringContract, type EditorCatalogueItem } from "./model";

export class EditorFrame {
    private sourceForRendered = new WeakMap<HTMLElement, HTMLElement>();
    private renderedForSource = new WeakMap<HTMLElement, HTMLElement>();
    private resizeObserver: ResizeObserver | null = null;
    private selected: HTMLElement | null = null;

    constructor(
        private readonly iframe: HTMLIFrameElement,
        private readonly highlight: HTMLElement,
        private readonly select: (source: HTMLElement) => void,
        private readonly loaded: () => void,
    ) {}

    connect(): void {
        this.iframe.addEventListener("load", this.handleLoad);
        window.addEventListener("resize", this.positionHighlight);
        window.addEventListener("scroll", this.positionHighlight, true);
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(this.positionHighlight);
            this.resizeObserver.observe(this.iframe);
        }
        this.bindDocument();
    }

    disconnect(): void {
        this.iframe.removeEventListener("load", this.handleLoad);
        window.removeEventListener("resize", this.positionHighlight);
        window.removeEventListener("scroll", this.positionHighlight, true);
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.iframe.contentDocument?.removeEventListener("click", this.handleFrameClick, true);
        this.iframe.contentDocument?.removeEventListener("submit", this.preventSubmit, true);
        this.iframe.contentWindow?.removeEventListener("scroll", this.positionHighlight);
    }

    map(documentModel: EditablePageDocument, catalogue: readonly EditorCatalogueItem[]): void {
        const frameDocument = this.iframe.contentDocument;
        if (!frameDocument) {
            return;
        }
        this.sourceForRendered = new WeakMap();
        this.renderedForSource = new WeakMap();
        const rendered = Array.from(frameDocument.querySelectorAll<HTMLElement>("[cms-bloc]"));
        let cursor = 0;
        for (const source of documentModel.elements()) {
            const id = source.getAttribute("cms-bloc");
            const item = catalogue.find((candidate) => candidate.id === id);
            if (!id || item?.kind !== "component") {
                continue;
            }
            const offset = rendered.slice(cursor).findIndex((element) => element.getAttribute("cms-bloc") === id);
            if (offset < 0) {
                continue;
            }
            const element = rendered[cursor + offset]!;
            cursor += offset + 1;
            this.sourceForRendered.set(element, source);
            this.renderedForSource.set(source, element);
        }
        this.syncAuthoredState(documentModel, catalogue);
        this.positionHighlight();
    }

    contentValue(source: HTMLElement, slot: string, position: number): string | undefined {
        const rendered = this.renderedForSource.get(source);
        const target = rendered && this.renderedContentTargets(rendered, slot)[position];
        return target?.textContent?.trim() ?? undefined;
    }

    updateContent(source: HTMLElement, slot: string, position: number, value: string): void {
        const rendered = this.renderedForSource.get(source);
        const target = rendered && this.renderedContentTargets(rendered, slot)[position];
        if (target) {
            target.textContent = value;
            this.positionHighlight();
        }
    }

    updateAttribute(source: HTMLElement, name: string, value: string | boolean): void {
        const rendered = this.renderedForSource.get(source);
        if (!rendered) {
            return;
        }
        if (typeof value === "boolean") {
            rendered.toggleAttribute(name, value);
        } else if (value === "") {
            rendered.removeAttribute(name);
        } else {
            rendered.setAttribute(name, value);
        }
        this.positionHighlight();
    }

    highlightSource(source: HTMLElement | null): void {
        this.selected = source;
        this.positionHighlight();
    }

    private readonly handleLoad = (): void => {
        this.bindDocument();
        this.highlight.hidden = true;
        this.loaded();
    };

    private bindDocument(): void {
        const frameDocument = this.iframe.contentDocument;
        frameDocument?.removeEventListener("click", this.handleFrameClick, true);
        frameDocument?.addEventListener("click", this.handleFrameClick, true);
        frameDocument?.removeEventListener("submit", this.preventSubmit, true);
        frameDocument?.addEventListener("submit", this.preventSubmit, true);
        this.iframe.contentWindow?.removeEventListener("scroll", this.positionHighlight);
        this.iframe.contentWindow?.addEventListener("scroll", this.positionHighlight);
    }

    private readonly handleFrameClick = (event: Event): void => {
        const ElementConstructor = this.iframe.contentWindow?.Element;
        const target = ElementConstructor && event.target instanceof ElementConstructor ? event.target : null;
        if (target?.closest("a[href], button[type='submit'], input[type='submit']")) {
            event.preventDefault();
        }
        let root = target?.closest<HTMLElement>("[cms-bloc]") ?? null;
        while (root) {
            const source = this.sourceForRendered.get(root);
            if (source) {
                this.select(source);
                return;
            }
            root = root.parentElement?.closest<HTMLElement>("[cms-bloc]") ?? null;
        }
    };

    private readonly preventSubmit = (event: Event): void => {
        event.preventDefault();
    };

    private renderedContentTargets(rendered: HTMLElement, slot: string): Array<Text | Element> {
        const roots = slot
            ? Array.from(rendered.querySelectorAll<HTMLElement>(`[part~="${CSS.escape(slot)}"]`)).filter(
                  (element) => element.closest("[cms-bloc]") === rendered,
              )
            : [rendered];
        return editableContentTargets(roots, rendered, slot);
    }

    private syncAuthoredState(documentModel: EditablePageDocument, catalogue: readonly EditorCatalogueItem[]): void {
        for (const source of documentModel.elements()) {
            const item = catalogue.find(({ id }) => id === source.getAttribute("cms-bloc"));
            if (!item || item.kind !== "component" || !this.renderedForSource.has(source)) {
                continue;
            }
            for (const setting of authoringContract(item).settings ?? []) {
                this.updateAttribute(
                    source,
                    setting.id,
                    setting.type === "boolean"
                        ? source.hasAttribute(setting.id)
                        : (source.getAttribute(setting.id) ?? ""),
                );
            }
            for (const field of documentModel.contentFields(source, item)) {
                if (!field.value.includes("{{")) {
                    this.updateContent(source, field.slot, field.position, field.value);
                }
            }
        }
    }

    private readonly positionHighlight = (): void => {
        const source = this.selected;
        const rendered = source ? this.renderedForSource.get(source) : null;
        const frame = this.iframe.getBoundingClientRect();
        if (!rendered || frame.width === 0 || frame.height === 0) {
            this.highlight.hidden = true;
            return;
        }
        const rect = rendered.getBoundingClientRect();
        const left = Math.max(frame.left, frame.left + rect.left);
        const top = Math.max(frame.top, frame.top + rect.top);
        const right = Math.min(frame.right, frame.left + rect.right);
        const bottom = Math.min(frame.bottom, frame.top + rect.bottom);
        if (right <= left || bottom <= top) {
            this.highlight.hidden = true;
            return;
        }
        this.highlight.hidden = false;
        this.highlight.style.setProperty("--ulvia-official-page-editor-highlight-x", `${left}px`);
        this.highlight.style.setProperty("--ulvia-official-page-editor-highlight-y", `${top}px`);
        this.highlight.style.setProperty("--ulvia-official-page-editor-highlight-width", `${right - left}px`);
        this.highlight.style.setProperty("--ulvia-official-page-editor-highlight-height", `${bottom - top}px`);
    };
}
