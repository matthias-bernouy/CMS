import type { Editor } from "@bernouy/cms-content/editor";
import {
    COMPOSITION_OUTPUT_ATTRIBUTE,
    isCompositionRuntimeElement,
} from "@bernouy/components/base";

const STYLE_ID = "cms-editor-v2-highlight-style";
const HIGHLIGHT_ATTR = "data-cms-editor-v2-highlight";

export class FrameHighlight {
    private _target: HTMLElement | null = null;
    private _overlay: HTMLElement | null = null;
    private _resizeObserver: ResizeObserver | null = null;

    show(editor: Editor, options: { scrollIntoView?: boolean } = {}): void {
        this.hide();
        this._target = editor.target;
        const doc = editor.target.ownerDocument;
        this._ensureStyle(doc);
        const targets = this._measurementTargets(editor.target);

        if (options.scrollIntoView) {
            (targets[0] ?? editor.target).scrollIntoView({
                block:    "center",
                inline:   "nearest",
                behavior: "smooth",
            });
        }

        this._overlay = doc.createElement("div");
        this._overlay.setAttribute(HIGHLIGHT_ATTR, "");
        doc.body.append(this._overlay);

        this._resizeObserver = new ResizeObserver(() => this.update());
        for (const target of targets) this._resizeObserver.observe(target);
        doc.defaultView?.addEventListener("scroll", this.update, true);
        doc.defaultView?.addEventListener("resize", this.update);
        this.update();
    }

    hide(): void {
        if (this._target) {
            const win = this._target.ownerDocument.defaultView;
            win?.removeEventListener("scroll", this.update, true);
            win?.removeEventListener("resize", this.update);
        }
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        this._overlay?.remove();
        this._overlay = null;
        this._target = null;
    }

    dispose(): void {
        this.hide();
    }

    private readonly update = (): void => {
        if (!this._target || !this._overlay) return;
        const win = this._target.ownerDocument.defaultView;
        if (!win) return;

        const rect = unionRect(this._measurementTargets(this._target));
        this._overlay.style.left = `${rect.left + win.scrollX}px`;
        this._overlay.style.top = `${rect.top + win.scrollY}px`;
        this._overlay.style.width = `${rect.width}px`;
        this._overlay.style.height = `${rect.height}px`;
    };

    private _measurementTargets(target: HTMLElement): HTMLElement[] {
        if (!isCompositionRuntimeElement(target)) return [target];

        const output = Array.from(target.children).find(element => (
            element.hasAttribute(COMPOSITION_OUTPUT_ATTRIBUTE)
        ));
        const children = output
            ? Array.from(output.children).flatMap(element => visibleBoxes(element as HTMLElement))
            : [];
        return children.length > 0 ? children : [target];
    }

    private _ensureStyle(doc: Document): void {
        if (doc.getElementById(STYLE_ID)) return;

        const style = doc.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
[${HIGHLIGHT_ATTR}] {
    position: absolute;
    z-index: 2147483647;
    pointer-events: none;
    outline: 2px solid #16775f;
    outline-offset: -2px;
    border-radius: 8px;
    box-shadow: 0 0 0 1px rgba(22, 119, 95, 0.18), 0 8px 24px rgba(22, 119, 95, 0.14);
}
`;
        doc.head.append(style);
    }
}

function visibleBoxes(element: HTMLElement): HTMLElement[] {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return [element];
    return Array.from(element.children).flatMap(child => visibleBoxes(child as HTMLElement));
}

function unionRect(elements: HTMLElement[]): DOMRect {
    const rects = elements.map(element => element.getBoundingClientRect());
    const left = Math.min(...rects.map(rect => rect.left));
    const top = Math.min(...rects.map(rect => rect.top));
    const right = Math.max(...rects.map(rect => rect.right));
    const bottom = Math.max(...rects.map(rect => rect.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
}
