import getClosestEditorSystem from '../../dom/editor/getClosestEditorSystem';
import type { Editor } from './Editor';

export class HoverBinding {

    private _hoverElement: HTMLElement | null = null;
    private _handler = (e: MouseEvent) => this._onHover(e);

    constructor(private editor: Editor) {}

    /**
     * Attach the hover listener to the editor's anchor — except when
     * the anchor points to another editor that has its own BAG to
     * open. In that case fall back to our own target so the inner
     * editor owns its hover (no listener race on the same element).
     *
     * If the anchor points to another editor with NO BAG of its own
     * (`!isInteractive`), keep the anchor binding — otherwise nothing
     * would respond to the hover and a fetch-style parent would become
     * unreachable. The inner editor having an identifier is not enough;
     * what matters is whether it has actions, a panel or anything else
     * to surface.
     */
    bind(): void {
        this.unbind();
        let resolved = this.editor.getActionBarAnchor() ?? this.editor.target;
        const resolvedId = resolved.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
        const myId       = this.editor.target.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
        if (resolvedId && resolvedId !== myId) {
            const inner = document.compIdentifierToEditor?.get(resolvedId);
            if (inner?.isInteractive) resolved = this.editor.target;
        }
        this._hoverElement = resolved;
        this._hoverElement.addEventListener('mouseenter', this._handler);
    }

    unbind(): void {
        if (!this._hoverElement) return;
        this._hoverElement.removeEventListener('mouseenter', this._handler);
        this._hoverElement = null;
    }

    private _onHover(e: MouseEvent) {
        // Skip hover-triggered BAG opens when the user is pointing at a
        // visually invisible region — typically the closed-menu / fade-in
        // dropdown trap. We test the element *under the cursor*, not the
        // editor's target, because `mouseenter` on a parent editor fires
        // for any descendant regardless of geometry: an absolutely-
        // positioned (slotted) child sitting 150px below the trigger
        // still triggers the parent's `mouseenter` when the cursor enters
        // it. Checking the parent's own visibility would say "visible"
        // (its trigger is), miss the gap, and pop BAG over the empty
        // space below. The element under the cursor is the truthful
        // signal.
        //
        // Hover-only filter. Programmatic activation paths (breadcrumb
        // click, BlocActions navigation, …) still work — those are
        // explicit user intent and shouldn't be silenced.
        const elAtCursor = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        if (elAtCursor && isVisuallyInvisible(elAtCursor)) return;
        const editorSystem = getClosestEditorSystem(this.editor.target);
        editorSystem.blocActions.setEditor(this.editor);
        editorSystem.blocActions.open(e.clientX, e.clientY);
    }
}

/**
 * Returns true when the element should not be considered visible for
 * editor hover.
 *
 * Uses `Element.checkVisibility()` because it walks the **flat tree**
 * (rendering tree), not the light-DOM `parentElement` chain — critical
 * for the slotted-into-shadow case: an editor target lives in light DOM
 * but its visual context (a `<div class="dropdown" style="opacity:0">`
 * wrapping a `<slot>`) lives in the parent bloc's shadow root. A manual
 * `parentElement` walk never crosses that boundary and misses the
 * opacity on the wrapper.
 *
 * Covered:
 * - `display: none` (own or ancestor) — default of `checkVisibility`.
 * - `visibility: hidden` — `visibilityProperty: true`.
 * - `opacity: 0` (own or ancestor, including shadow ancestors of the
 *   slot host) — `opacityProperty: true`.
 *
 * The rect check stays for off-viewport positioning (transform, top:
 * -9999px) — `checkVisibility` doesn't consider geometry, only style.
 *
 * `checkVisibility` is supported in Chrome 105+, Safari 17.4+, Firefox
 * 125+ — well within the admin's modern-browser target. We feature-test
 * defensively and pass both legacy (`checkOpacity` / `checkVisibilityCSS`)
 * and current (`opacityProperty` / `visibilityProperty`) option names so
 * engines on either side of the rename accept the call.
 */
function isVisuallyInvisible(el: HTMLElement): boolean {
    if (typeof el.checkVisibility === "function") {
        const visible = el.checkVisibility({
            opacityProperty: true,
            visibilityProperty: true,
            checkOpacity: true,
            checkVisibilityCSS: true,
        } as CheckVisibilityOptions);
        if (!visible) return true;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return true;
    if (r.bottom <= 0 || r.right <= 0 || r.left >= innerWidth || r.top >= innerHeight) return true;
    return false;
}
