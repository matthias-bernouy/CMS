import type { Component } from "src/control/core/editorSystem/Component";
import css from "./ImageSync.style.css" with { type: "text" };
import { lockActions } from "./lock";
import { resolveTarget, syncDefault } from "./target";
import { render, updatePreview, watchTarget } from "./view";
import { openMediaCenter, clearTarget } from "./mediaCenter";

/**
 * <p9r-image-sync slotTarget="image" label="Cover image" default="https://placehold.co/800x450"></p9r-image-sync>
 *
 * @attr slotTarget - the slot name where the <img> lives in the component
 * @attr accept     - media types for MediaCenter (default: "image")
 * @attr label      - label shown above the preview
 * @attr default    - default image src if none exists
 */
export class ImageSync extends HTMLElement {

    _component: Component | null = null;
    _target: HTMLImageElement | null = null;
    _previewImg: HTMLImageElement | null = null;
    _emptyState: HTMLElement | null = null;
    _overlay: HTMLElement | null = null;
    _targetObserver: MutationObserver | null = null;
    _prepared = false;

    constructor() {
        super();
        // Own shadow root so the style applies regardless of how many
        // shadow roots wrap the host (config panel → section → editor).
        // CSS in `document.head` won't traverse those boundaries.
        this.attachShadow({ mode: "open" }).innerHTML = `<style>${css}</style>`;
    }

    connectedCallback() {
        const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (componentIdentifier && !this._component) {
            this._component = document.querySelector(
                `[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`
            );
        }

        requestAnimationFrame(() => {
            if (!this._prepared) syncDefault(this);
            render(this);
        });
    }

    disconnectedCallback() {
        this._targetObserver?.disconnect();
        this._targetObserver = null;
    }

    /** Eager pass while detached: seeds default + locks target. Skips render. */
    prepare(component: Component) {
        this._component = component;
        syncDefault(this);
        this._target = resolveTarget(this);
        lockActions(this._target);
        watchTarget(this);
        if (this._target && this.allowResize) {
            this._target.setAttribute(p9r.attr.ACTION.ALLOW_RESIZE_IMAGE, "true");
        }
        this._prepared = true;
    }

    init(opts?: { added?: HTMLElement; removed?: HTMLElement }) {
        const target = resolveTarget(this);
        // Bail out unless the mutation concerns our own <img> — see perf
        // scenario `image-sync-init-cost`.
        if (opts?.added && opts.added !== target) return;
        if (opts?.removed && opts.removed !== this._target && opts.removed !== target) return;
        this._target = target;
        lockActions(this._target);
        watchTarget(this);
        if (this._target && this.allowResize) {
            this._target.setAttribute(p9r.attr.ACTION.ALLOW_RESIZE_IMAGE, "true");
        }
        updatePreview(this, this._target?.getAttribute("src") || "");
    }

    openMediaCenter() { openMediaCenter(this); }
    clearTarget()     { clearTarget(this); }

    get slotName(): string  { return this.getAttribute("slotTarget") || ""; }
    get isMultiSelect()     { return this.hasAttribute("multi-select"); }
    get allowResize()       { return this.hasAttribute("allow-resize"); }
    get optionnal()         { return this.hasAttribute("optionnal"); }
    get isCreating(): boolean {
        return this._component?.getAttribute(p9r.attr.EDITOR.IS_CREATING) === "true";
    }
}

if (!customElements.get("p9r-image-sync")) {
    customElements.define("p9r-image-sync", ImageSync);
}
