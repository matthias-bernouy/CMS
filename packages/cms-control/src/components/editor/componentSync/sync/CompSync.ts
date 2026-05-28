import type { Component } from "src/control/core/editorSystem/Component";

/**
 * `<p9r-comp-sync>` is both a **slot content manager** (clones its light-DOM
 * template into the bloc's slot when empty, and editorizes existing children)
 * AND a **panel control** that lets the user quickly reach every element
 * currently in that slot.
 *
 * The light-DOM first child is the *template* used for defaulting / cloning;
 * it is hidden from the user. The rendered UI lives in the shadow root so it
 * does not interfere with slot matching or cloning.
 *
 * Supported attributes:
 *   - `allow-multiple`            — list mode (add / delete / duplicate / drag)
 *   - `optionnal`                 — deletable (one-n spelling, kept deliberately)
 *   - `disable-others-components` — opt-out: forbid swapping the element. By
 *                                   default the user CAN swap the slot element
 *                                   for a different component via the action
 *                                   bar; set this attribute to lock the tag.
 *   - `inline-adding`             — *(with `allow-multiple`)* places the
 *                                   `+ before` / `+ after` buttons to the
 *                                   left/right of each item instead of
 *                                   above/below — for horizontal lists.
 *   - `label`                     — optional header label; defaults to slot name
 *   - `data-min` / `data-max`     — bounds for list mode (default 1 / Infinity)
 */
export class CompSync extends HTMLElement {

    private _component: Component | null = null;
    private _root: ShadowRoot;
    private _listEl: HTMLElement;
    private _titleEl: HTMLElement;
    private _countEl: HTMLElement;
    private _addBtn: HTMLButtonElement;
    // Set by Editor._initPanelFragment's eager prepare() pass so a later
    // connectedCallback (when the panel is actually opened) doesn't re-run
    // _sync() and re-clone the default template on top of user content.
    private _prepared = false;

    constructor() {
        super();
        this._root = this.attachShadow({ mode: "open" });
        this._root.innerHTML = `
            <style>${CompSync._css}</style>
            <div class="panel">
                <div class="header">
                    <span class="title"></span>
                    <span class="count"></span>
                </div>
                <ul class="items"></ul>
                <button class="add" type="button" hidden>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <span>Add</span>
                </button>
            </div>
        `;
        this._listEl  = this._root.querySelector(".items")!  as HTMLElement;
        this._titleEl = this._root.querySelector(".title")!  as HTMLElement;
        this._countEl = this._root.querySelector(".count")!  as HTMLElement;
        this._addBtn  = this._root.querySelector(".add")!    as HTMLButtonElement;

        this._addBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._add();
        });
    }

    connectedCallback() {
        const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (componentIdentifier && !this._component) {
            this._component = document.querySelector(`[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`);
        }
        requestAnimationFrame(() => {
            if (!this._prepared) {
                this._sync();
                console.debug(this._component)
                this._component?.connectedCallback();
            }
            this.init();
        });
    }

    /**
     * Eager pass invoked from Editor._initPanelFragment while this element
     * still lives in a detached fragment. Runs the slot-defaulting clone
     * and applies DISABLE_* attrs so the component is in a valid state
     * before the user interacts — even though the panel UI hasn't been
     * rendered yet. connectedCallback later skips the duplicate work.
     */
    public prepare(component: Component) {
        this._component = component;
        this._sync();
        this._component?.connectedCallback();
        this.init();
        this._prepared = true;
    }

    private _sync() {
        const child = this.firstElementChild;
        if (!child) {
            throw new Error("p9r-comp-sync require a child");
        }

        const slotName = child.getAttribute("slot");

        const selector = slotName ? `[slot="${slotName}"]` : ':not([slot])';

        if (!this._component?.querySelector(selector)) {
            if (!this.isCreating && this.optionnal) return;
            const toAppend = child.cloneNode(true) as HTMLElement;
            toAppend.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
            this._component?.append(toAppend);
        }
    }

    init(opts?: { added?: HTMLElement; removed?: HTMLElement }){
        const child = this.firstElementChild;
        const slotName = child?.getAttribute("slot");

        if ( !child ) {
            throw new Error("p9r-comp-sync require a child with attribute 'slot'");
        }

        const selector = slotName
                ? `:scope > [slot="${slotName}"]`
                : `:scope > :not([slot])`;

        let slots = Array.from(this._component?.querySelectorAll(selector)!) as Component[];

        // Incremental REMOVE: the removed node is already detached, so the
        // N-1 surviving siblings don't need their slot attrs re-applied or
        // `viewEditor()` re-run — their state hasn't changed. We just drop
        // the matching <li> and re-index. The only exception is the min
        // threshold crossing, where delete/drag must be re-locked on the
        // remaining slots. Same O(N²) → O(1) story as the add path (hot
        // path: hold-Delete inside a list).
        if (opts?.removed) {
            if (this.isConnected) {
                this._removePanelItem(opts.removed);
                this._updatePanelCount(slots.length);
                this._refreshAddBtn(slots.length);
            }

            if (this.isMultiple && slots.length === this.min) {
                slots.forEach((slot) => {
                    if (!this.optionnal) {
                        slot.setAttribute(p9r.attr.ACTION.DISABLE_DELETE, "true");
                    }
                    slot.setAttribute(p9r.attr.ACTION.DISABLE_DRAGGING, "true");
                    const id = slot.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
                    if (id) document.compIdentifierToEditor.get(id)?.viewEditor();
                });
            }
            return;
        }

        const addedNode = opts?.added;

        // When we know which node was just added, we can skip re-applying the
        // slot attributes on the N-1 untouched siblings — their state hasn't
        // changed. This turns the hot path of "hold-Enter inside a list" from
        // O(N²) into O(N).
        const toProcess = (addedNode && slots.includes(addedNode as Component))
            ? [addedNode as Component]
            : slots;

        toProcess.forEach((slot) => {
            const slotEditor = document.compIdentifierToEditor.get(slot.getAttribute(p9r.attr.EDITOR.IDENTIFIER)!);
            slot.setAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE, "true");
            slot.setAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER, "true");
            slot.setAttribute(p9r.attr.ACTION.DISABLE_ADD_BEFORE, "true");
            slot.setAttribute(p9r.attr.ACTION.DISABLE_DRAGGING, "true");

            if ( this.disableOthersComponents ) {
                slot.setAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT, "true");
            } else {
                slot.removeAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT);
            }

            if ( this.optionnal ) {
                slot.removeAttribute(p9r.attr.ACTION.DISABLE_DELETE);
            } else {
                slot.setAttribute(p9r.attr.ACTION.DISABLE_DELETE, "true");
            }

            slot.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER)!)
            if (this.isMultiple){

                if (this.inlineAdding){
                     slot.setAttribute(p9r.attr.ACTION.INLINE_ADDING, "true");
                } else {
                    slot.removeAttribute(p9r.attr.ACTION.INLINE_ADDING);
                }
                slot.removeAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE);
                slot.removeAttribute(p9r.attr.ACTION.DISABLE_DELETE);
                slot.removeAttribute(p9r.attr.ACTION.DISABLE_DRAGGING);
                slot.removeAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER);
                slot.removeAttribute(p9r.attr.ACTION.DISABLE_ADD_BEFORE);

                if ( slots.length == this.min ) {
                    if ( !this.optionnal ) {
                        slot.setAttribute(p9r.attr.ACTION.DISABLE_DELETE, "true");
                    }
                    slot.setAttribute(p9r.attr.ACTION.DISABLE_DRAGGING, "true");
                }

            } else {
            }
            slotEditor?.viewEditor();
        })

        // Incremental render when we know only one slot was added: append a
        // single <li> instead of wiping + recreating the whole list. The
        // previous approach was O(N) per insert, so a hold-Enter on a list of
        // N items was O(N²) in DOM churn (listeners + nodes), which is why
        // work kept piling up well after the key was released.
        //
        // When this CompSync lives in a detached fragment (lazy panel not yet
        // opened), `isConnected` is false — we did the slot-attr work above
        // and skip the panel UI entirely.
        if (!this.isConnected) return;
        if (addedNode && slots.includes(addedNode as Component)) {
            this._appendPanelItem(addedNode, slots.length - 1);
            this._updatePanelCount(slots.length);
            this._refreshAddBtn(slots.length);
        } else {
            this._renderPanel(slots);
        }
    }

    // ── Rendered UI ──────────────────────────────────────────────────────

    private _renderPanel(slots: HTMLElement[]) {
        this._titleEl.textContent = this._titleLabel();
        this._updatePanelCount(slots.length);

        this._listEl.innerHTML = "";
        slots.forEach((slot, index) => this._appendPanelItem(slot, index));

        this._refreshAddBtn(slots.length);
    }

    // Centralised so every path that changes slot count (_renderPanel,
    // incremental add, incremental remove) keeps the button state in sync.
    // Optional single-slot mode brings the button back once the user deletes
    // the only slot — without that, an optional comp-sync with nothing inside
    // is a dead-end.
    private _refreshAddBtn(count: number) {
        const optionalEmptySingle = this.optionnal && !this.isMultiple && count === 0;
        const canAddMultiple = this.isMultiple && count < this.max;
        this._addBtn.hidden = !(this.isMultiple || optionalEmptySingle);
        this._addBtn.disabled = !(canAddMultiple || optionalEmptySingle);
    }

    private _updatePanelCount(total: number) {
        if (this.isMultiple) {
            const max = this.max === Infinity ? "∞" : String(this.max);
            this._countEl.textContent = `${total} / ${max}`;
            this._countEl.hidden = false;
        } else {
            this._countEl.textContent = "";
            this._countEl.hidden = true;
        }
    }

    private _appendPanelItem(slot: HTMLElement, index: number) {
        const li = document.createElement("li");
        // Stash the slot ref on the <li> so incremental removes can find the
        // matching item without rescanning the DOM.
        (li as any)._slot = slot;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "item";
        btn.innerHTML = `
            <span class="item-index">#${index + 1}</span>
            <span class="item-label"></span>
        `;
        btn.querySelector(".item-label")!.textContent = this._slotLabel(slot);
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._focus(slot);
        });
        li.append(btn);
        this._listEl.append(li);
    }

    private _removePanelItem(removed: HTMLElement) {
        const lis = Array.from(this._listEl.children) as HTMLLIElement[];
        for (const li of lis) {
            if ((li as any)._slot === removed) {
                li.remove();
                break;
            }
        }
        Array.from(this._listEl.children).forEach((li, i) => {
            const idx = li.querySelector(".item-index");
            if (idx) idx.textContent = `#${i + 1}`;
        });
    }

    private _titleLabel(): string {
        const custom = this.getAttribute("label");
        if (custom) return custom;
        const child = this.firstElementChild;
        const slotName = child?.getAttribute("slot");
        return slotName || "Default slot";
    }

    private _slotLabel(slot: HTMLElement): string {
        const text = (slot.textContent || "").trim().replace(/\s+/g, " ");
        if (text.length > 0) {
            return text.length > 40 ? text.slice(0, 40) + "…" : text;
        }
        return `<${slot.tagName.toLowerCase()}>`;
    }

    private _focus(slot: HTMLElement) {
        (this.closest("p9r-config-panel") as any)?.close?.();
        slot.scrollIntoView({ behavior: "smooth", block: "center" });
        if (!slot.hasAttribute("tabindex")) slot.setAttribute("tabindex", "-1");
        try {
            slot.focus({ preventScroll: true });
        } catch {
            // focus() can throw on some element types; scrollIntoView already ran.
        }
    }

    private _add() {
        if (!this._component) return;

        const template = this.firstElementChild;
        if (!template) return;

        const current = this._countSlots();
        if (this.isMultiple) {
            if (current >= this.max) return;
        } else {
            // Optional single-slot: only re-insert when currently empty.
            if (!this.optionnal || current > 0) return;
        }

        const clone = template.cloneNode(true) as HTMLElement;
        clone.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
        this._component.append(clone);
        // The ObserverManager picks up the mutation, creates an Editor for the
        // new child, and calls `onChildrenAdded` on the parent editor — which
        // re-runs `ConfigPanel.init()` and therefore our `init()` → re-render.
    }

    private _countSlots(): number {
        if (!this._component) return 0;
        const child = this.firstElementChild;
        const slotName = child?.getAttribute("slot");
        const selector = slotName ? `:scope > [slot="${slotName}"]` : `:scope > :not([slot])`;
        return this._component.querySelectorAll(selector).length;
    }

    // ── Attribute-backed config ─────────────────────────────────────────

    get isMultiple(){
        return this.hasAttribute("allow-multiple");
    }

    get optionnal(){
        return this.hasAttribute("optionnal");
    }

    get min(): number {
        const raw = this.getAttribute("data-min") ?? this.getAttribute("min");
        const n = raw != null ? parseInt(raw, 10) : NaN;
        return Number.isFinite(n) && n >= 0 ? n : 1;
    }

    get max(): number {
        const raw = this.getAttribute("data-max") ?? this.getAttribute("max");
        const n = raw != null ? parseInt(raw, 10) : NaN;
        return Number.isFinite(n) && n >= 1 ? n : Infinity;
    }

    get inlineAdding(){
        return this.hasAttribute(p9r.attr.ACTION.INLINE_ADDING);
    }

    get disableOthersComponents(){
        return this.hasAttribute("disable-others-components");
    }

    get isCreating(): boolean {
        return this._component?.getAttribute(p9r.attr.EDITOR.IS_CREATING) === "true";
    }

    private static _css = `
        :host {
            display: block;
            margin: 8px 0;
        }

        .panel {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px 12px;
            border: 1px solid var(--border-default, #e2e8f0);
            border-radius: 10px;
            background: var(--bg-surface, #fff);
        }

        .header {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 8px;
        }

        .title {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-muted, #94a3b8);
        }

        .count {
            font-size: 10px;
            font-weight: 600;
            color: var(--text-muted, #94a3b8);
            font-variant-numeric: tabular-nums;
        }

        .items {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .items:empty {
            display: none;
        }

        .item {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 7px 10px;
            border: 1px solid var(--border-default, #e2e8f0);
            border-radius: 8px;
            background: var(--bg-surface, #fff);
            color: var(--text-main, #1e293b);
            font-size: 12px;
            font-weight: 500;
            text-align: left;
            cursor: pointer;
            transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
            outline: none;
        }

        .item:hover {
            border-color: var(--primary-base, #4361ee);
            background: var(--primary-muted, rgb(67 97 238 / 0.08));
        }

        .item:focus-visible {
            border-color: var(--primary-base, #4361ee);
            box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
        }

        .item-index {
            flex-shrink: 0;
            font-size: 10px;
            font-weight: 700;
            color: var(--text-muted, #94a3b8);
            font-variant-numeric: tabular-nums;
        }

        .item-label {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .add {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: 100%;
            padding: 7px 10px;
            margin-top: 2px;
            border: 1px dashed var(--border-default, #e2e8f0);
            border-radius: 8px;
            background: transparent;
            color: var(--text-muted, #94a3b8);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
            outline: none;
        }

        .add:hover:not(:disabled) {
            border-color: var(--primary-base, #4361ee);
            color: var(--primary-base, #4361ee);
            background: var(--primary-muted, rgb(67 97 238 / 0.08));
        }

        .add:focus-visible {
            border-color: var(--primary-base, #4361ee);
            box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
        }

        .add:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    `;


}

if (!customElements.get("p9r-comp-sync")) {
    customElements.define("p9r-comp-sync", CompSync)
}
