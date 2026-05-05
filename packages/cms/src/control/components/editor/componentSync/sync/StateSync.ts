import type { Component } from "src/control/core/editorSystem/Component";
import type { Editor } from "src/control/core/editorSystem/Editor/Editor";

/**
 * <p9r-state-sync target=".dropdown" attr="class" value="is-open" label="Dropdown" placement="left"></p9r-state-sync>
 *
 * Declarative "pinnable state" for a component in editor mode.
 * - target    : selector resolved in the component's shadow DOM.
 * - attr      : attribute to override.
 * - value     : value to force. For `class`, add/remove this token in the class list;
 *               for any other attr, set/unset the full value.
 * - label     : shown in the pin menu when multiple state-syncs coexist.
 * - placement : where the floating unpin button sits relative to the pinned
 *               editor — "left" | "right" | "top" | "bottom". Default "left".
 *
 * While pinned, a MutationObserver on the target reinstates the value if the
 * component's own handlers remove it.
 */
export class StateSync extends HTMLElement {

    private _component: Component | null = null;
    private _editor: Editor | null = null;
    private _pinned: boolean = false;
    private _observer: MutationObserver | null = null;
    private _prepared = false;

    get targetSelector(): string   { return this.getAttribute("target") || ""; }
    get attrName():       string   { return this.getAttribute("attr")   || ""; }
    get attrValue():      string   { return this.getAttribute("value")  || ""; }
    get label():          string   { return this.getAttribute("label")  || this.attrValue || this.attrName; }
    get placement():      "left" | "right" | "top" | "bottom" {
        const v = this.getAttribute("placement");
        return (v === "right" || v === "top" || v === "bottom") ? v : "left";
    }
    get isPinned():       boolean  { return this._pinned; }

    connectedCallback() {
        if (this._prepared) return;
        const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (!componentIdentifier) return;

        this._component = document.querySelector(
            `[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`
        );
        this._editor = document.compIdentifierToEditor?.get(componentIdentifier) ?? null;
        this._editor?.registerStateSync(this);
    }

    /**
     * Eager pass from Editor._initPanelFragment. Registers this StateSync on
     * the editor so _hasInteractiveFeatures / BAG pin button are correctly
     * reported even before the panel DOM exists.
     */
    public prepare(component: Component, editor: Editor) {
        this._component = component;
        this._editor = editor;
        editor.registerStateSync(this);
        this._prepared = true;
    }

    disconnectedCallback() {
        this.unpin();
        this._editor?.unregisterStateSync(this);
    }

    private _targets(): HTMLElement[] {
        const root = this._component?.shadowRoot;
        if (!root || !this.targetSelector) return [];
        return Array.from(root.querySelectorAll(this.targetSelector));
    }

    private _apply(el: HTMLElement) {
        if (this.attrName === "class") {
            if (this.attrValue) el.classList.add(this.attrValue);
        } else {
            el.setAttribute(this.attrName, this.attrValue);
        }
    }

    private _clear(el: HTMLElement) {
        if (this.attrName === "class") {
            if (this.attrValue) el.classList.remove(this.attrValue);
        } else {
            el.removeAttribute(this.attrName);
        }
    }

    private _isApplied(el: HTMLElement): boolean {
        if (this.attrName === "class") {
            return !!this.attrValue && el.classList.contains(this.attrValue);
        }
        return el.getAttribute(this.attrName) === this.attrValue;
    }

    pin() {
        if (this._pinned) return;
        const targets = this._targets();
        if (targets.length === 0) return;

        targets.forEach(el => this._apply(el));

        this._observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                const el = m.target as HTMLElement;
                if (!this._isApplied(el)) this._apply(el);
            }
        });
        const attrFilter = this.attrName === "class" ? ["class"] : [this.attrName];
        targets.forEach(el => this._observer!.observe(el, { attributes: true, attributeFilter: attrFilter }));

        this._pinned = true;
    }

    unpin() {
        if (!this._pinned) return;
        this._observer?.disconnect();
        this._observer = null;
        this._targets().forEach(el => this._clear(el));
        this._pinned = false;
    }

    toggle() {
        if (this._pinned) this.unpin();
        else this.pin();
    }
}

if (!customElements.get("p9r-state-sync")) {
    customElements.define("p9r-state-sync", StateSync);
}
