import type { BlocActions } from "./BlocActions/BlocActions";
import type { RichTextBar } from "../RichTextBar/RichTextBar";

const DRAG_PILL_WIDTH = 180;
const DRAG_PILL_HEIGHT = 32;

/**
 * Drag & drop for editor blocks.
 *
 * Design: during a drag, the dragged element is hidden (`display:none`) so it
 * is out of the layout flow. We never mutate the DOM on `dragover` — instead
 * we show a thin drop indicator at the candidate insertion point, and the
 * real `insertBefore` happens exactly once on `drop`. This eliminates the
 * reflow-during-drag jumps and makes `closest()` deterministic because the
 * dragged node is not a candidate sibling anymore.
 */
export class DragManager {
    private draggedElement: HTMLElement | null = null;
    private _originalDisplay: string = "";
    private _ghost: HTMLElement | null = null;
    private _indicator: HTMLElement | null = null;
    private _dropTarget: HTMLElement | null = null;
    private _dropPosition: "before" | "after" | null = null;

    // Stable handlers so dispose() can pair add/remove. Previously arrow
    // literals in the constructor: no dispose path, and a second
    // EditorManager instance would stack a second set of listeners on the
    // container — each drag would fire handleDrag* twice.
    private _onDragStart = (e: DragEvent) => this.handleDragStart(e);
    private _onDragOver = (e: DragEvent) => this.handleDragOver(e);
    private _onDrop = (e: DragEvent) => this.handleDrop(e);
    private _onDragEnd = () => this.handleDragEnd();
    private _container: HTMLElement;

    constructor(container: HTMLElement) {
        this._container = container;
        container.addEventListener("dragstart", this._onDragStart);
        container.addEventListener("dragover", this._onDragOver);
        container.addEventListener("drop", this._onDrop);
        container.addEventListener("dragend", this._onDragEnd);
    }

    dispose() {
        this._container.removeEventListener("dragstart", this._onDragStart);
        this._container.removeEventListener("dragover", this._onDragOver);
        this._container.removeEventListener("drop", this._onDrop);
        this._container.removeEventListener("dragend", this._onDragEnd);
        this._finalize();
    }

    private handleDragStart(e: DragEvent) {
        this.draggedElement = (e.target as HTMLElement).closest(".editor-block");
        if (!this.draggedElement) return;

        e.dataTransfer?.setData("text/plain", "");
        this._setGhostImage(e);
        this.draggedElement.classList.add("dragging");
        const root = this._container.getRootNode() as ShadowRoot | Document;
        (root.querySelector("cms-bloc-actions") as BlocActions | null)?.close();
        (root.querySelector("cms-richtextbar") as RichTextBar | null)?.hide();

        // Hide from flow on the next tick — `display:none` applied
        // synchronously inside dragstart aborts the native drag operation
        // (the source element would vanish mid-init). Defer so the browser
        // has committed the drag start, then hide for the rest of the drag.
        this._originalDisplay = this.draggedElement.style.display;
        const toHide = this.draggedElement;
        setTimeout(() => {
            if (this.draggedElement === toHide) toHide.style.display = "none";
        }, 0);

        this._createIndicator();
    }

    private handleDragOver(e: DragEvent) {
        e.preventDefault();
        if (!this.draggedElement) return;

        const target = this._pickTarget(e);
        if (!target) {
            this._hideIndicator();
            return;
        }

        const rect = target.getBoundingClientRect();
        const horizontal = this._isHorizontalFlow(target);
        const after = horizontal
            ? (e.clientX - rect.left) / (rect.right - rect.left) > 0.5
            : (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
        this._dropTarget = target;
        this._dropPosition = after ? "after" : "before";
        this._showIndicator(target, after, horizontal);
    }

    /**
     * A horizontal flow means siblings lay out left-to-right: the drop
     * indicator must be a **vertical** bar on the side of the target, not a
     * horizontal bar on the top/bottom. Detected from the parent's computed
     * style (flex-row / grid / inline variants).
     */
    private _isHorizontalFlow(target: HTMLElement): boolean {
        const parent = target.parentElement;
        if (!parent) return false;
        const cs = getComputedStyle(parent);
        const display = cs.display;
        if (display.includes("inline")) return true;
        if (display.endsWith("flex")) {
            return cs.flexDirection.startsWith("row");
        }
        if (display.endsWith("grid")) {
            // Grid auto-flow defaults to "row" (fill left-to-right). Either
            // way, once siblings share the same top they're in a row.
            return true;
        }
        return false;
    }

    /**
     * Find the drop target sibling under the cursor. Requirements:
     *  1. Must be a `.editor-block`.
     *  2. Must not be the dragged element itself.
     *  3. Must not be an ancestor of the dragged element (prevents the old
     *     "jumps between nesting levels" glitch).
     */
    private _pickTarget(e: DragEvent): HTMLElement | null {
        const el = (e.target as HTMLElement | null)?.closest?.(".editor-block") as HTMLElement | null;
        if (!el) return null;
        if (el === this.draggedElement) return null;
        if (this.draggedElement && el.contains(this.draggedElement)) return null;
        // Opted-out participants (e.g. p9r-image-sync's locked <img>) should
        // neither be dragged nor receive drops — otherwise we'd insert a
        // sibling that the panel is about to wipe back out.
        if (el.getAttribute(p9r.attr.ACTION.DISABLE_DRAGGING) === "true") return null;
        return el;
    }

    private handleDrop(e: DragEvent) {
        e.preventDefault();
        this._commitDrop();
        this._finalize();
    }

    private handleDragEnd() {
        // Drop didn't fire (cancelled / outside a drop zone) → no move; just
        // clean up and restore visibility where the element was originally.
        this._finalize();
    }

    private _commitDrop() {
        if (!this.draggedElement || !this._dropTarget || !this._dropPosition) return;

        this._matchSlot(this._dropTarget.getAttribute("slot"));
        const parent = this._dropTarget.parentElement;
        if (!parent) return;

        if (this._dropPosition === "after") {
            parent.insertBefore(this.draggedElement, this._dropTarget.nextSibling);
        } else {
            parent.insertBefore(this.draggedElement, this._dropTarget);
        }
    }

    private _matchSlot(slotName: string | null) {
        if (!this.draggedElement) return;
        const current = this.draggedElement.getAttribute("slot");
        if (slotName === current) return;
        if (slotName) {
            this.draggedElement.setAttribute("slot", slotName);
        } else {
            this.draggedElement.removeAttribute("slot");
        }
    }

    // ── Visuals ─────────────────────────────────────────────────────────

    private _setGhostImage(e: DragEvent) {
        if (!e.dataTransfer || !this.draggedElement) return;

        // A compact pill — discrete, always readable, independent of the
        // source's size. The cloned-scaled approach fails for full-bleed
        // heroes (scale ~0.05 destroys every detail) and for blocs with
        // lazy-loaded content (images / fonts / shadow DOM children).
        const ghost = document.createElement("div");
        ghost.className = "p9r-drag-ghost";
        Object.assign(ghost.style, {
            position: "fixed",
            top: "-9999px",
            left: "-9999px",
            width: `${DRAG_PILL_WIDTH}px`,
            height: `${DRAG_PILL_HEIGHT}px`,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "0 12px",
            boxSizing: "border-box",
            background: "rgba(30, 41, 59, 0.95)",
            color: "#fff",
            border: "1px solid rgba(67, 97, 238, 0.8)",
            borderRadius: "999px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: "12px",
            fontWeight: "600",
            lineHeight: "1",
            pointerEvents: "none",
            overflow: "hidden",
            whiteSpace: "nowrap",
        } as Partial<CSSStyleDeclaration>);

        ghost.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round"
                 style="flex-shrink:0;opacity:0.8">
                <circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/>
                <circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>
            </svg>
            <span style="overflow:hidden;text-overflow:ellipsis"></span>
        `;
        ghost.querySelector("span")!.textContent = `<${this.draggedElement.tagName.toLowerCase()}>`;

        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 16, DRAG_PILL_HEIGHT / 2);
        this._ghost = ghost;
    }

    private _createIndicator() {
        const ind = document.createElement("div");
        ind.className = "p9r-drop-indicator";
        Object.assign(ind.style, {
            position: "fixed",
            height: "3px",
            background: "rgba(67, 97, 238, 1)",
            borderRadius: "2px",
            boxShadow: "0 0 8px rgba(67, 97, 238, 0.6)",
            pointerEvents: "none",
            zIndex: "999999",
            opacity: "0",
            left: "0",
            top: "0",
            width: "0",
        } as Partial<CSSStyleDeclaration>);
        document.body.appendChild(ind);
        this._indicator = ind;
    }

    private _showIndicator(target: HTMLElement, after: boolean, horizontal: boolean) {
        if (!this._indicator) return;
        const r = target.getBoundingClientRect();
        if (horizontal) {
            const x = (after ? r.right : r.left) - 1.5;
            this._indicator.style.left = `${x}px`;
            this._indicator.style.top = `${r.top}px`;
            this._indicator.style.width = "3px";
            this._indicator.style.height = `${r.height}px`;
        } else {
            const y = (after ? r.bottom : r.top) - 1.5;
            this._indicator.style.left = `${r.left}px`;
            this._indicator.style.top = `${y}px`;
            this._indicator.style.width = `${r.width}px`;
            this._indicator.style.height = "3px";
        }
        this._indicator.style.opacity = "1";
    }

    private _hideIndicator() {
        if (this._indicator) this._indicator.style.opacity = "0";
        this._dropTarget = null;
        this._dropPosition = null;
    }

    private _finalize() {
        if (this.draggedElement) {
            this.draggedElement.style.display = this._originalDisplay;
            this.draggedElement.classList.remove("dragging");
        }
        this._ghost?.remove();
        this._ghost = null;
        this._indicator?.remove();
        this._indicator = null;
        this._dropTarget = null;
        this._dropPosition = null;
        this.draggedElement = null;
    }
}
