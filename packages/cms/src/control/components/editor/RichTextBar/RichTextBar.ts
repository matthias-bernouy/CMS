import { Component } from "@bernouy/cms/component";
import "src/control/components/editor/componentSync/PageLink/PageLink";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

import { SelectionTracker } from "./selection";
import { closeLinkBar } from "./actions";
import { closeCompletions } from "./extensions";
import type { RichTextBarExtension } from "src/control/core/editorSystem/extensions/types";
import getClosestEditorSystem from "src/control/core/dom/editor/getClosestEditorSystem";
import {
    handleClick,
    handleCustomColorInput,
    handleOutsideMouseDown,
    handleRootMousedown,
    handleRootMouseup,
    handleSelection,
} from "./listener";

/**
 * User-theme tokens we mirror onto the bar host as `--swatch-<token>` so the
 * color swatches can render the site's actual palette. We snapshot resolved
 * values from the working element at mount: the bar lives in the editor
 * shell shadow where `EditorRoot.style.css` overrides the same names with
 * the editor's chrome palette, so a plain `var(--primary-base)` on a swatch
 * picks up the wrong color. The applied color attributes stay as `var(...)`
 * (deferred against the working element scope), so only the visual preview
 * is materialized — the saved markup still references the live theme.
 */
const USER_THEME_TOKENS = [
    "text-main", "text-body", "text-muted", "text-label",
    "border-default", "border-light",
    "primary-base", "primary-muted", "primary-contrasted",
    "secondary-base", "secondary-muted", "secondary-contrasted",
    "danger-base", "danger-muted", "danger-contrasted",
    "success-base", "success-muted", "success-contrasted",
    "info-base", "info-muted", "info-contrasted",
    "warning-base", "warning-muted", "warning-contrasted",
] as const;

export class RichTextBar extends Component {

    selection = new SelectionTracker();
    interacting = false;
    pageLink: HTMLElement | null = null;

    /** Cached editable element under the caret. Used by `refreshExtensions`
     *  to skip the ancestor walk when the caret stays in the same element
     *  (selectionchange fires on every keystroke). */
    _lastEditable: Element | null = null;

    /** Extensions collected at the current caret. Snapshot — refreshed when the
     *  editable changes. The popover reads from here when the user clicks the
     *  brace button. */
    _currentExtensions: RichTextBarExtension[] = [];

    // Stable handler refs so connect/disconnect can pair up. Previously
    // these were arrow literals in connectedCallback — every re-append
    // (EditorManager.switchMode does exactly that) leaked 2 document
    // listeners (selectionchange + mousedown).
    private _onRootMousedown    = (e: Event)      => handleRootMousedown(this, e);
    private _onRootMouseup      = ()              => handleRootMouseup(this);
    private _onRootClick        = (e: Event)      => handleClick(this, e as MouseEvent);
    private _onRootChange       = (e: Event)      => handleCustomColorInput(this, e);
    private _onSelectionChange  = ()              => handleSelection(this);
    private _onOutsideMousedown = (e: MouseEvent) => handleOutsideMouseDown(this, e);
    /** Bloc editors dispatch this when their `getCompletions()` payload
     *  changes (typically after an async schema fetch resolves). Drop the
     *  caret cache so the next `selectionchange` re-walks ancestors and
     *  picks the freshly-populated extensions up. */
    private _onExtensionsInvalidated = () => { this._lastEditable = null; };
    private _rootListenersAttached = false;

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        const root = this.shadowRoot!;
        if (!this._rootListenersAttached) {
            // Shadow-root listeners survive re-parenting (the shadow root is
            // owned by this element), so attach once only — no matching
            // disconnectedCallback cleanup needed.
            root.addEventListener("mousedown", this._onRootMousedown);
            root.addEventListener("mouseup", this._onRootMouseup);
            root.addEventListener("click", this._onRootClick);
            root.addEventListener("change", this._onRootChange);
            this._rootListenersAttached = true;
        }
        document.addEventListener("selectionchange", this._onSelectionChange);
        // Selection-change alone doesn't close the bar when the user clicks an
        // element that doesn't collapse the caret (a non-editable sibling in
        // the parent, a BAG button with preventDefault, etc.). Catch those via
        // a document-level mousedown outside the bar and outside the current
        // editable.
        document.addEventListener("mousedown", this._onOutsideMousedown);
        document.addEventListener("richtextbar:invalidate", this._onExtensionsInvalidated);

        if (!this.pageLink) {
            this.pageLink = document.createElement("p9r-link");
            this.pageLink.setAttribute("label", "");
            this.pageLink.setAttribute("name", "href");
            root.querySelector(".link-pages-wrap")!.appendChild(this.pageLink);
        }

        this._syncSwatchVariables();
    }

    /**
     * Resolve user-theme tokens against the working element's computed style
     * and mirror them onto this host as `--swatch-<token>` properties so the
     * color panel previews the user's palette instead of the editor's.
     */
    private _syncSwatchVariables(): void {
        let workingElement: HTMLElement | null = null;
        try {
            const editorSystem = getClosestEditorSystem(this);
            workingElement = editorSystem.shadowRoot?.querySelector<HTMLElement>("#workingElement") ?? null;
        } catch {
            return;
        }
        if (!workingElement) return;
        const computed = getComputedStyle(workingElement);
        for (const token of USER_THEME_TOKENS) {
            const value = computed.getPropertyValue(`--${token}`).trim();
            if (value) this.style.setProperty(`--swatch-${token}`, value);
        }
    }

    disconnectedCallback() {
        document.removeEventListener("selectionchange", this._onSelectionChange);
        document.removeEventListener("mousedown", this._onOutsideMousedown);
        document.removeEventListener("richtextbar:invalidate", this._onExtensionsInvalidated);
    }

    show(rect: DOMRect) {
        this.classList.add("visible");
        this.shadowRoot!.querySelector(".color-panel")?.classList.remove("open");
        closeLinkBar(this);

        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const gap = 10;
        const barWidth = this.offsetWidth;
        const barHeight = this.offsetHeight;

        let top: number;
        if (rect.top < barHeight + gap) {
            top = rect.bottom + scrollY + gap;
        } else {
            top = rect.top + scrollY - barHeight - gap;
        }

        let left = rect.left + scrollX + (rect.width - barWidth) / 2;
        const minLeft = scrollX + gap;
        const maxLeft = scrollX + window.innerWidth - barWidth - gap;
        left = Math.max(minLeft, Math.min(maxLeft, left));

        this.style.top = `${top}px`;
        this.style.left = `${left}px`;
    }

    hide() {
        this.classList.remove("visible");
        this.shadowRoot!.querySelector(".color-panel")?.classList.remove("open");
        closeLinkBar(this);
        closeCompletions(this);
    }
}

customElements.define("cms-richtextbar", RichTextBar);
