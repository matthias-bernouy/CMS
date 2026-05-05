import type { StateSync } from "../../../components/editor/componentSync/sync/StateSync";
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

    private static _stylesInjected = false;

    private _btn: HTMLButtonElement | null = null;
    private _resizeObs: ResizeObserver | null = null;
    private _reflow = () => this._position();
    private _rafId = 0;
    private _lastRect: { x: number; y: number; w: number; h: number } | null = null;

    constructor(
        private _target: HTMLElement,
        private _stateSyncs: StateSync[],
        private _onUnpinAll: () => void,
    ) {}

    get active(): boolean {
        return this._btn !== null;
    }

    enter() {
        PinMode._injectStyles();
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
        document.body.appendChild(btn);

        window.addEventListener("scroll", this._reflow, { passive: true, capture: true });
        window.addEventListener("resize", this._reflow);
        this._resizeObs = new ResizeObserver(this._reflow);
        this._resizeObs.observe(this._target);
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
            const r = this._target.getBoundingClientRect();
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
        const rect = this._target.getBoundingClientRect();
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

    private static _injectStyles() {
        if (PinMode._stylesInjected) return;
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
        document.head.appendChild(style);
        PinMode._stylesInjected = true;
    }
}
