import type { Component } from "@bernouy/components/base";
import type { Editor }    from "cms-control/core/editorSystem/Editor/Editor";
import { parseValues, parseLabels, parsePlacement } from "./parseAttrs";
import { makeStateAttrOps, type StateAttrOps }      from "./applyTargets";

/**
 * <p9r-state-sync target=".dropdown" attr="class" value="is-open">                            ← single (legacy)
 * <p9r-state-sync target=":host" attr="data-state" values="loading,error,empty,success">     ← multi
 *
 * Pinnable runtime state. Single-mode = binary toggle. Multi-mode = N
 * mutually-exclusive values; pin-swap allowed; "no pin" is valid.
 * A `MutationObserver` reinstates the active value if the component's own
 * handlers remove it. Self-writes don't ping-pong: the callback is idempotent
 * (`isApplied` reads true after our own write → no-op).
 */
export class StateSync extends HTMLElement {

    private _component:   Component | null = null;
    private _editor:      Editor    | null = null;
    private _activeValue: string    | null = null;
    private _observer:    MutationObserver | null = null;
    private _ops:         StateAttrOps | null = null;
    private _prepared:    boolean = false;

    get targetSelector(): string   { return this.getAttribute("target") || ""; }
    get attrName():       string   { return this.getAttribute("attr")   || ""; }
    get isMulti():        boolean  { return this.getAttribute("values") !== null; }
    get values():         string[] { return parseValues(this); }
    get labels():         string[] { return parseLabels(this, this.values); }
    get label():          string   { return this.getAttribute("label") || this.labels[0] || this.attrName; }
    get placement()                { return parsePlacement(this); }
    get activeValue():  string | null { return this._activeValue; }
    get isPinned():     boolean       { return this._activeValue !== null; }

    /** Sets the active value (one of `values`) or null to unpin. Idempotent. */
    setActiveValue(value: string | null): void {
        if (value !== null && !this.values.includes(value)) return;
        if (value === this._activeValue) return;
        const targets = this._targets();
        if (value !== null && targets.length === 0) return;

        this._ops ??= makeStateAttrOps(this.attrName);
        if (this._activeValue !== null) targets.forEach(el => this._ops!.clear(el, this._activeValue!));
        if (value             !== null) targets.forEach(el => this._ops!.apply(el, value));
        if (value !== null && this._observer === null) this._startObserver(targets);
        if (value === null) this._stopObserver();
        this._activeValue = value;
    }

    toggle(): void { this.setActiveValue(this._activeValue === null ? (this.values[0] ?? null) : null); }
    unpin():  void { this.setActiveValue(null); }

    connectedCallback() {
        if (this._prepared) return;
        const id = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (!id) return;
        this._component = document.querySelector(`[${p9r.attr.EDITOR.IDENTIFIER}="${id}"]`);
        this._editor    = document.compIdentifierToEditor?.get(id) ?? null;
        this._editor?.registerStateSync(this);
    }

    public prepare(component: Component, editor: Editor): void {
        this._component = component;
        this._editor    = editor;
        editor.registerStateSync(this);
        this._prepared  = true;
    }

    disconnectedCallback() {
        this.setActiveValue(null);
        this._editor?.unregisterStateSync(this);
    }

    private _targets(): HTMLElement[] {
        const root = this._component?.shadowRoot;
        if (!root || !this.targetSelector) return [];
        return Array.from(root.querySelectorAll(this.targetSelector));
    }

    private _startObserver(targets: HTMLElement[]): void {
        const filter = this.attrName === "class" ? ["class"] : [this.attrName];
        this._observer = new MutationObserver(() => {
            const v = this._activeValue;
            if (v === null) return;
            targets.forEach(el => { if (!this._ops!.isApplied(el, v)) this._ops!.apply(el, v); });
        });
        targets.forEach(el => this._observer!.observe(el, { attributes: true, attributeFilter: filter }));
    }

    private _stopObserver(): void {
        this._observer?.disconnect();
        this._observer = null;
    }
}

if (!customElements.get("p9r-state-sync")) {
    customElements.define("p9r-state-sync", StateSync);
}
