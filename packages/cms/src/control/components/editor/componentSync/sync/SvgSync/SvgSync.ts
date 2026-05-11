import type { Component } from "src/control/core/editorSystem/Component";
import css from "./SvgSync.style.css" with { type: "text" };
import { lockActions } from "./lock";
import { resolveTarget, syncDefault } from "./target";
import { render, updatePreview } from "./view";
import { openPicker } from "./mediaCenter";

/**
 * <p9r-svg-sync slotTarget="icon" label="Icon">
 *     <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>
 * </p9r-svg-sync>
 *
 * Inline SVG picker for blocs. Mirrors `<p9r-image-sync>`'s slot-target
 * pattern: addresses the slotted child via `slotTarget`, not a shadow
 * selector. The slotted SVG IS what the user sees (projected through
 * `<slot name="X">` in the bloc shadow), so the preview, the swap target,
 * and the saved markup all reference the same node — no double-mechanism
 * drift between an inline shadow default and a slotted override.
 *
 * Default content comes from the sync's own children: clone the inline
 * `<svg>` template at mount if no `<svg slot="X">` exists yet on the
 * component. Source-code-trusted, no sanitize. User-uploaded SVGs (via
 * MediaCenter) go through `sanitizeSvg` before injection.
 *
 * The bloc author still owns the swap-safety contract (rule 7):
 *   1. `currentColor` for fill/stroke.
 *   2. Size via the wrapper, not the SVG.
 *   3. Don't target SVG internals.
 *
 * @attr slotTarget — required, slot name where the `<svg>` lives in the bloc.
 * @attr label      — optional, shown above the picker card.
 */
export class SvgSync extends HTMLElement {

    _component: Component | null = null;
    _target: SVGElement | null = null;
    _preview: HTMLElement | null = null;
    _error: HTMLElement | null = null;
    _prepared = false;

    constructor() {
        super();
        // Own shadow root so the style applies regardless of how many
        // shadow roots wrap the host (same rationale as ImageSync).
        this.attachShadow({ mode: "open" }).innerHTML = `<style>${css}</style>`;
    }

    connectedCallback() {
        const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (componentIdentifier && !this._component) {
            this._component = document.querySelector(
                `[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`,
            );
        }
        requestAnimationFrame(() => {
            if (!this._prepared) syncDefault(this);
            render(this);
        });
    }

    /** Eager pass while detached: seeds default + locks target. Skips render. */
    prepare(component: Component) {
        this._component = component;
        syncDefault(this);
        this._target = resolveTarget(this);
        lockActions(this._target);
        this._prepared = true;
    }

    init(opts?: { added?: HTMLElement; removed?: HTMLElement }) {
        const target = resolveTarget(this);
        // Same bail rule as ImageSync.init: ignore mutations that don't
        // concern our own slotted child — keeps sibling fan-out cheap.
        // `added`/`removed` are typed as HTMLElement but the actual node
        // is an SVGElement when our SVG is involved; compare by Element
        // identity, which is the only thing that matters.
        const added = opts?.added as unknown as Element | undefined;
        const removed = opts?.removed as unknown as Element | undefined;
        if (added && added !== target) return;
        if (removed && removed !== this._target && removed !== target) return;
        this._target = target;
        lockActions(this._target);
        updatePreview(this);
    }

    openMediaCenter() { openPicker(this); }

    _showError(msg: string) {
        if (!this._error) return;
        this._error.textContent = msg;
        this._error.hidden = false;
    }

    _clearError() {
        if (!this._error) return;
        this._error.textContent = "";
        this._error.hidden = true;
    }

    get slotName(): string { return this.getAttribute("slotTarget") || ""; }
}

if (!customElements.get("p9r-svg-sync")) {
    customElements.define("p9r-svg-sync", SvgSync);
}
