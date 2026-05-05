const ROOT_ID = "p9r-editor-highlight-root";

let root: HTMLDivElement | null = null;
const active = new Set<Highlight>();
let onScrollOrResize: (() => void) | null = null;

function ensureRoot(): HTMLDivElement {
    if (root) return root;
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999;";
    document.body.appendChild(root);
    return root;
}

function attachGlobal() {
    if (onScrollOrResize) return;
    onScrollOrResize = () => active.forEach(h => h.update());
    window.addEventListener("scroll", onScrollOrResize, { capture: true, passive: true });
    window.addEventListener("resize", onScrollOrResize);
}

function detachGlobal() {
    if (!onScrollOrResize) return;
    window.removeEventListener("scroll", onScrollOrResize, { capture: true } as any);
    window.removeEventListener("resize", onScrollOrResize);
    onScrollOrResize = null;
}

export interface HighlightOptions {
    color?: string;
    thickness?: number;
    radius?: number;
}

/**
 * Floating outline overlay around a target element. Lives in a fixed,
 * pointer-events-none, overflow-hidden root attached to <body>, so it
 * never causes window overflow and never intercepts events on the
 * target. The target's own DOM/CSS is never touched.
 *
 * Auto-tracks size (ResizeObserver) and viewport changes (scroll/resize).
 * Caller must invoke `dispose()` when the target leaves the DOM.
 */
export class Highlight {
    private _target: HTMLElement;
    private _box: HTMLDivElement;
    private _ro: ResizeObserver;

    constructor(target: HTMLElement, options: HighlightOptions = {}) {
        this._target = target;
        const r = ensureRoot();
        this._box = document.createElement("div");
        const color = options.color ?? "#3b82f6";
        const thickness = options.thickness ?? 2;
        const radius = options.radius ?? 0;
        this._box.style.cssText =
            `position:absolute;left:0;top:0;border:${thickness}px solid ${color};` +
            `border-radius:${radius}px;box-sizing:border-box;pointer-events:none;`;
        r.appendChild(this._box);

        this._ro = new ResizeObserver(() => this.update());
        this._ro.observe(target);

        active.add(this);
        attachGlobal();
        this.update();
    }

    update(): void {
        const rect = this._target.getBoundingClientRect();
        const s = this._box.style;
        s.transform = `translate(${rect.left}px, ${rect.top}px)`;
        s.width = `${rect.width}px`;
        s.height = `${rect.height}px`;
        s.display = rect.width === 0 && rect.height === 0 ? "none" : "block";
    }

    setColor(color: string): void {
        this._box.style.borderColor = color;
    }

    dispose(): void {
        this._ro.disconnect();
        this._box.remove();
        active.delete(this);
        if (active.size === 0) detachGlobal();
    }
}
