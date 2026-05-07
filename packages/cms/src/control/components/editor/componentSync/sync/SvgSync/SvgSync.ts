import type { Component } from "src/control/core/editorSystem/Component";
import type { MediaCenter } from "../../../MediaCenter/MediaCenter";
import css from "./SvgSync.style.css" with { type: "text" };
import { sanitizeSvg } from "./sanitize";

/**
 * <p9r-svg-sync target=".icon" label="Icon"><span>…</span></p9r-svg-sync>
 *
 * Inline SVG swap for blocs. Replaces the `<svg>` element matched by
 * `target` (selector relative to the bloc shadow) with one picked from
 * the Media Center. The new markup is sanitized server-of-trust-side
 * (`sanitize.ts`) — disallowed tags, `on*` handlers and dangerous href
 * schemes are stripped before injection.
 *
 * The bloc author OWNS the swap-safety contract:
 *   1. Use `currentColor` for fill/stroke so cascade colors the icon.
 *   2. Size via the WRAPPER element, not via the SVG's `width`/`height`.
 *   3. Don't target SVG internals (`#myPath`, `.icon path:nth-child(2)`).
 * Documented in `.claude/rules/cms-bloc-development.md` (rule 7).
 *
 * @attr target — required, CSS selector to the SVG inside the bloc shadow.
 * @attr label  — optional, shown above the picker preview.
 */
export class SvgSync extends HTMLElement {

    private _component: Component | null = null;
    private _preview: HTMLElement | null = null;
    private _error:   HTMLElement | null = null;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `
            <style>${css}</style>
            <span class="label"></span>
            <div class="card" part="card">
                <div class="preview" part="preview"></div>
                <span class="action">Click to swap…</span>
            </div>
            <div class="error" part="error" hidden></div>
        `;
    }

    connectedCallback() {
        const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (componentIdentifier && !this._component) {
            this._component = document.querySelector(
                `[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`,
            );
        }
        const root = this.shadowRoot!;
        root.querySelector(".label")!.textContent = this.getAttribute("label") || "Icon";
        this._preview = root.querySelector(".preview");
        this._error   = root.querySelector(".error");
        root.querySelector(".card")!.addEventListener("click", () => this._openPicker());
        this._refreshPreview();
    }

    private _resolveTarget(): SVGElement | null {
        const sel = this.getAttribute("target");
        if (!sel) return null;
        return this._component?.shadowRoot?.querySelector(sel) ?? null;
    }

    private _refreshPreview() {
        const target = this._resolveTarget();
        if (!this._preview) return;
        this._preview.innerHTML = "";
        if (target instanceof SVGElement) {
            this._preview.appendChild(target.cloneNode(true));
        } else {
            const empty = document.createElement("div");
            empty.className = "empty";
            this._preview.appendChild(empty);
        }
    }

    private _showError(msg: string) {
        if (!this._error) return;
        this._error.textContent = msg;
        this._error.hidden = false;
    }

    private _clearError() {
        if (!this._error) return;
        this._error.textContent = "";
        this._error.hidden = true;
    }

    private _openPicker() {
        this._clearError();
        const mc = document.createElement("cms-media-center") as MediaCenter;
        document.body.appendChild(mc);

        const handler = async (e: Event) => {
            mc.removeEventListener("select-item", handler);
            const src = (e as CustomEvent).detail?.src as string | undefined;
            mc.remove();
            if (!src) return;
            if (!/\.svg($|\?)/i.test(src)) {
                this._showError("Please pick an SVG file (.svg).");
                return;
            }
            try {
                const svgText = await fetch(src).then(r => r.text());
                const cleaned = sanitizeSvg(svgText);
                this._injectInto(cleaned);
            } catch (err) {
                this._showError(err instanceof Error ? err.message : String(err));
            }
        };
        mc.addEventListener("select-item", handler);
        requestAnimationFrame(() => mc.show(["folder", "image"]));
    }

    private _injectInto(svgMarkup: string) {
        const target = this._resolveTarget();
        if (!target) { this._showError("Target SVG not found in bloc."); return; }

        const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
        const fresh  = parsed.documentElement;
        if (!(fresh instanceof SVGElement)) { this._showError("Sanitized markup is not a valid SVG."); return; }

        // Preserve the target's class attribute so the bloc's CSS keeps
        // matching the new node. Everything else (viewBox, xmlns, paths)
        // comes from the new SVG.
        const cls = target.getAttribute("class");
        if (cls) fresh.setAttribute("class", cls);

        target.replaceWith(fresh);
        this._refreshPreview();
    }
}

if (!customElements.get("p9r-svg-sync")) {
    customElements.define("p9r-svg-sync", SvgSync);
}
