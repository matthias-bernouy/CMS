import type { StateSync } from "../../../components/editor/componentSync/sync/StateSync/StateSync";
import { ICON_PIN } from "../../../components/icons";

/**
 * Encapsulates the "pinned editor" UX: while any <p9r-state-sync> on an
 * editor is pinned, we suppress hover on that editor (no action bar, no
 * outline) and show a single floating "Unpin" button at the placement
 * declared by the first pinned state-sync. This prevents the parent's
 * hover visuals from leaking onto children that only become reachable
 * once a state is pinned (dropdowns, modals, flyouts).
 *
 * Owned by the Editor — one PinMode per Editor instance.
 */
export class PinMode {

    private static _stylesInjectedFor = new WeakSet<Node>();

    private _btn: HTMLButtonElement | null = null;
    private _resizeObs: ResizeObserver | null = null;
    private _reflow = () => this._position();
    private _rafId = 0;
    private _lastRect: { x: number; y: number; w: number; h: number } | null = null;

    /**
     * `_parent` is where the floating Unpin button and its `<style>` are
     * appended. Default `document.body` keeps backward compatibility with
     * callers that don't care about scoping. Pass the editor shell's
     * shadow root to resolve theme variables against the chrome palette
     * instead of the site's theme. `position: fixed` still anchors to the
     * viewport from inside a shadow root, as long as no ancestor has
     * `transform` / `filter` / `perspective` / `will-change` set.
     */
    constructor(
        private _getAnchor: () => HTMLElement,
        private _stateSyncs: StateSync[],
        private _onUnpinAll: () => void,
        private _parent: ParentNode = document.body,
    ) {}

    get active(): boolean {
        return this._btn !== null;
    }

    enter() {
        PinMode._injectStyles(this._parent);
        if (this._btn) { this._position(); return; }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "p9r-unpin-btn";
        btn.title = "Unpin state";
        btn.innerHTML = `${ICON_PIN}<span>Unpin</span>`;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._onUnpinAll();
        });
        this._btn = btn;
        this._parent.appendChild(btn);

        window.addEventListener("scroll", this._reflow, { passive: true, capture: true });
        window.addEventListener("resize", this._reflow);
        this._resizeObs = new ResizeObserver(this._reflow);
        this._resizeObs.observe(this._getAnchor());
        this._resizeObs.observe(document.body);

        // A sibling resizing/reflowing can displace `_target` without
        // changing its own box — ResizeObserver on the target alone misses
        // that. Poll the rect via rAF while pinned and reposition on diff.
        this._startRectWatch();

        this._position();
    }

    exit() {
        if (!this._btn) return;
        this._btn.remove();
        this._btn = null;
        window.removeEventListener("scroll", this._reflow, { capture: true } as any);
        window.removeEventListener("resize", this._reflow);
        this._resizeObs?.disconnect();
        this._resizeObs = null;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = 0;
        }
        this._lastRect = null;
    }

    private _startRectWatch() {
        const tick = () => {
            if (!this._btn) return;
            const r = this._getAnchor().getBoundingClientRect();
            const last = this._lastRect;
            if (!last || last.x !== r.left || last.y !== r.top || last.w !== r.width || last.h !== r.height) {
                this._lastRect = { x: r.left, y: r.top, w: r.width, h: r.height };
                this._position();
            }
            this._rafId = requestAnimationFrame(tick);
        };
        this._rafId = requestAnimationFrame(tick);
    }

    private _position() {
        if (!this._btn) return;
        const rect = this._getAnchor().getBoundingClientRect();
        const placement = this._stateSyncs.find(s => s.isPinned)?.placement ?? "left";
        const gap = 8;
        const bw = this._btn.offsetWidth;
        const bh = this._btn.offsetHeight;
        let x = 0, y = 0;
        switch (placement) {
            case "right":
                x = rect.right + gap;
                y = rect.top + rect.height / 2 - bh / 2;
                break;
            case "top":
                x = rect.left + rect.width / 2 - bw / 2;
                y = rect.top - bh - gap;
                break;
            case "bottom":
                x = rect.left + rect.width / 2 - bw / 2;
                y = rect.bottom + gap;
                break;
            default:
                x = rect.left - bw - gap;
                y = rect.top + rect.height / 2 - bh / 2;
        }
        x = Math.max(4, Math.min(x, window.innerWidth - bw - 4));
        y = Math.max(4, Math.min(y, window.innerHeight - bh - 4));
        this._btn.style.left = `${x}px`;
        this._btn.style.top = `${y}px`;
    }

    private static _injectStyles(parent: ParentNode) {
        // Place the `<style>` so it applies wherever the button lands.
        // - Mount in a shadow tree → inject `<style>` at the shadow root
        //   (shadow `<style>` only applies inside its own tree).
        // - Mount in light DOM → inject in `<head>`.
        // The mount point itself (`parent`) is often a plain `<div>` inside
        // a shadow root (e.g. `#editorSystem`), so we walk up via
        // `getRootNode()` to find the actual style scope.
        const root = (parent as Node).getRootNode();
        const styleHost: ParentNode = root instanceof ShadowRoot ? root : document.head;
        if (PinMode._stylesInjectedFor.has(styleHost as Node)) return;
        const style = document.createElement("style");
        style.textContent = `
.p9r-unpin-btn {
    position: fixed;
    z-index: 10002;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid var(--primary-base, #4361ee);
    background: var(--bg-surface, #fff);
    color: var(--primary-base, #4361ee);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}
.p9r-unpin-btn svg { width: 14px; height: 14px; }
.p9r-unpin-btn:hover { background: var(--primary-base, #4361ee); color: #fff; }
`;
        styleHost.appendChild(style);
        PinMode._stylesInjectedFor.add(styleHost as Node);
    }
}
