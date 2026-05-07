import css from "./LinkPopover.style.css" with { type: "text" };
import { classifyLink } from "src/control/core/editorSystem/classifyLink";
import { getEditorContext, type LinkClassification } from "src/control/core/editorSystem/editorContext";

/**
 * Mini-toolbar anchored above (or below, depending on viewport room) the
 * currently-active `<a>`. Created once at editor boot and reused across
 * link clicks — `attachTo` repositions and re-renders the buttons for the
 * new target. Closes on Escape and on click outside the bar.
 *
 * The popover NEVER fires `preventDefault` on its own click events that
 * land on its buttons — buttons explicitly trigger `requestNavigation`
 * via `editorContext`, which lets EditorRoot decide what to do (jump,
 * open new tab, scroll). Plain clicks on the underlying link / its text
 * still bubble through TextEditor + SvgEditor unaffected.
 */
export class LinkPopover extends HTMLElement {
    private _bar:    HTMLElement | null = null;
    private _href:   HTMLElement | null = null;
    private _action: HTMLButtonElement | null = null;

    private _target: HTMLAnchorElement | null = null;
    private _onDocClick = (e: MouseEvent) => this._maybeCloseOnOutsideClick(e);
    private _onKey      = (e: KeyboardEvent) => { if (e.key === "Escape") this.close(); };

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `
            <style>${css}</style>
            <div class="bar" part="bar">
                <span class="href"></span>
                <span class="divider"></span>
                <button type="button" class="primary action"></button>
            </div>
        `;
        this._bar    = root.querySelector(".bar");
        this._href   = root.querySelector(".href");
        this._action = root.querySelector(".action");

        this._action!.addEventListener("click", (e) => this._onActionClick(e));
    }

    /** Anchor the popover to a new `<a>` element and render its actions. */
    attachTo(anchor: HTMLAnchorElement) {
        this._target = anchor;
        const href = anchor.getAttribute("href") || "";
        const cls  = classifyLink(href, location.origin, getEditorContext().knownPagePaths);

        if (this._href) {
            this._href.textContent = href || "(empty)";
            this._href.title = href;
        }
        if (this._action) {
            const { label, icon } = primaryActionLabel(cls);
            this._action.textContent = `${icon} ${label}`;
            this._action.dataset["kind"] = cls.kind;
        }

        this.classList.add("open");
        // Position next frame so layout has measured.
        requestAnimationFrame(() => this._reposition());

        document.addEventListener("click", this._onDocClick, true);
        document.addEventListener("keydown", this._onKey);
    }

    close() {
        this.classList.remove("open");
        this._target = null;
        document.removeEventListener("click", this._onDocClick, true);
        document.removeEventListener("keydown", this._onKey);
    }

    private _reposition() {
        if (!this._target || !this._bar) return;
        const r = this._target.getBoundingClientRect();
        const barH = this._bar.getBoundingClientRect().height;
        const above = r.top - barH - 6;
        if (above >= 0) {
            this.style.top  = `${above}px`;
        } else {
            this.style.top  = `${r.bottom + 6}px`;
        }
        this.style.left = `${Math.max(8, r.left)}px`;
    }

    private _maybeCloseOnOutsideClick(e: MouseEvent) {
        const path = e.composedPath();
        if (path.includes(this) || (this._target && path.includes(this._target))) return;
        this.close();
    }

    private _onActionClick(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (!this._target) return;
        const href = this._target.getAttribute("href") || "";
        const ctx  = getEditorContext();
        const cls  = classifyLink(href, location.origin, ctx.knownPagePaths);
        ctx.requestNavigation({ href, classification: cls, via: "popover-action" });
    }

}

function primaryActionLabel(cls: LinkClassification): { label: string; icon: string } {
    switch (cls.kind) {
        case "page":     return { label: "Edit page",       icon: "↗" };
        case "anchor":   return { label: "Scroll",          icon: "↓" };
        case "asset":    return { label: "Open in new tab", icon: "↗" };
        case "external": return { label: "Open in new tab", icon: "↗" };
        case "mailto":   return { label: "Open",            icon: "↗" };
        case "empty":    return { label: "—",               icon: "" };
    }
}

if (!customElements.get("cms-link-popover")) {
    customElements.define("cms-link-popover", LinkPopover);
}
