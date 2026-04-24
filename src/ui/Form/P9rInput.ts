export class P9rInput extends HTMLElement {

    static formAssociated = true;

    static get observedAttributes() {
        return [
            "value",
            "label",
            "placeholder",
            "type",
            "hint",
            "hint-level",
            "max-count",
            "invalid",
            "disabled",
            "required",
        ];
    }

    private _internals: ElementInternals;
    private _input: HTMLInputElement | null;
    private _labelEl: HTMLLabelElement | null;
    private _hintEl: HTMLElement | null;
    private _metaEl: HTMLElement | null;
    private _counterEl: HTMLElement | null;
    private _countEl: HTMLElement | null;
    private _maxEl: HTMLElement | null;

    constructor() {
        super();
        this._internals = this.attachInternals();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <style>${P9rInput._css}</style>
            <div class="field" part="field">
                <label class="label" part="label"></label>
                <input class="input" part="input" type="text" />
                <div class="meta" part="meta" hidden>
                    <small class="hint" part="hint"></small>
                    <small class="counter" part="counter" hidden data-over="false"><span class="count">0</span>/<span class="max">0</span></small>
                </div>
            </div>
        `;
        this._labelEl = shadow.querySelector(".label");
        this._input = shadow.querySelector(".input");
        this._hintEl = shadow.querySelector(".hint");
        this._metaEl = shadow.querySelector(".meta");
        this._counterEl = shadow.querySelector(".counter");
        this._countEl = shadow.querySelector(".count");
        this._maxEl = shadow.querySelector(".max");

        const labelId = `p9r-input-label-${++P9rInput._uid}`;
        if (this._labelEl && this._input) {
            this._labelEl.id = labelId;
            this._input.setAttribute("aria-labelledby", labelId);
        }
    }

    connectedCallback() {
        for (const prop of ["value", "disabled", "required"]) {
            this._upgradeProperty(prop);
        }

        this._input?.addEventListener("input", this._onInput);
        this._input?.addEventListener("change", this._onChange);

        this._syncLabel();
        this._syncPlaceholder();
        this._syncType();
        this._syncDisabled();
        this._syncRequired();
        this._syncHint();
        this._syncHintLevel();
        this._syncInvalid();
        this._syncMaxCount();

        const initialValue = this.getAttribute("value");
        if (initialValue !== null) this.value = initialValue;
        else this._updateCounter();
    }

    disconnectedCallback() {
        this._input?.removeEventListener("input", this._onInput);
        this._input?.removeEventListener("change", this._onChange);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._input) return;
        switch (name) {
            case "value":       if (newVal !== null) this.value = newVal; break;
            case "label":       this._syncLabel(); break;
            case "placeholder": this._syncPlaceholder(); break;
            case "type":        this._syncType(); break;
            case "disabled":    this._syncDisabled(); break;
            case "required":    this._syncRequired(); break;
            case "hint":        this._syncHint(); break;
            case "hint-level":  this._syncHintLevel(); break;
            case "invalid":     this._syncInvalid(); break;
            case "max-count":   this._syncMaxCount(); this._updateCounter(); break;
        }
    }

    get value(): string { return this._input?.value ?? ""; }
    set value(v: string) {
        if (!this._input) return;
        this._input.value = v;
        this._internals.setFormValue(v);
        this._updateCounter();
    }

    get name(): string { return this.getAttribute("name") ?? ""; }

    get disabled(): boolean { return this._input?.disabled ?? false; }
    set disabled(v: boolean) {
        if (v) this.setAttribute("disabled", "");
        else this.removeAttribute("disabled");
    }

    get required(): boolean { return this.hasAttribute("required"); }
    set required(v: boolean) {
        if (v) this.setAttribute("required", "");
        else this.removeAttribute("required");
    }

    override focus() { this._input?.focus(); }

    setHint(level: "info" | "error" | "success", text: string) {
        if (!this._hintEl) return;
        this._hintEl.textContent = text;
        this._hintEl.dataset.level = level;
        this._refreshMetaVisibility();
    }

    setInvalid(invalid: boolean) {
        if (invalid) this.setAttribute("invalid", "");
        else this.removeAttribute("invalid");
    }

    private _onInput = () => {
        if (!this._input) return;
        this._internals.setFormValue(this._input.value);
        this._updateCounter();
    };

    private _onChange = () => {
        if (!this._input) return;
        this._internals.setFormValue(this._input.value);
    };

    private _syncLabel() {
        if (!this._labelEl) return;
        const text = this.getAttribute("label") ?? "";
        this._labelEl.textContent = text;
        this._labelEl.hidden = text === "";
    }

    private _syncPlaceholder() {
        if (!this._input) return;
        const v = this.getAttribute("placeholder");
        if (v === null) this._input.removeAttribute("placeholder");
        else this._input.setAttribute("placeholder", v);
    }

    private _syncType() {
        if (!this._input) return;
        const v = this.getAttribute("type") ?? "text";
        this._input.setAttribute("type", v);
    }

    private _syncDisabled() {
        if (!this._input) return;
        this._input.disabled = this.hasAttribute("disabled");
    }

    private _syncRequired() {
        if (!this._input) return;
        const required = this.hasAttribute("required");
        this._input.required = required;
        if (required) this._input.setAttribute("aria-required", "true");
        else this._input.removeAttribute("aria-required");
    }

    private _syncHint() {
        if (!this._hintEl) return;
        this._hintEl.textContent = this.getAttribute("hint") ?? "";
        this._refreshMetaVisibility();
    }

    private _syncHintLevel() {
        if (!this._hintEl) return;
        const level = this.getAttribute("hint-level") ?? "info";
        this._hintEl.dataset.level = level;
    }

    private _syncInvalid() {
        if (!this._input) return;
        if (this.hasAttribute("invalid")) this._input.setAttribute("aria-invalid", "true");
        else this._input.removeAttribute("aria-invalid");
    }

    private _syncMaxCount() {
        if (!this._counterEl || !this._maxEl) return;
        const max = this._parseMaxCount();
        if (max === null) {
            this._counterEl.hidden = true;
        } else {
            this._counterEl.hidden = false;
            this._maxEl.textContent = String(max);
        }
        this._refreshMetaVisibility();
    }

    private _parseMaxCount(): number | null {
        const raw = this.getAttribute("max-count");
        if (raw === null) return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    private _updateCounter() {
        if (!this._input || !this._counterEl || !this._countEl) return;
        const max = this._parseMaxCount();
        if (max === null) return;
        const len = this._input.value.length;
        this._countEl.textContent = String(len);
        this._counterEl.dataset.over = String(len > max);
    }

    private _refreshMetaVisibility() {
        if (!this._hintEl || !this._counterEl || !this._metaEl) return;
        const hasHint = (this._hintEl.textContent ?? "").length > 0;
        const hasCounter = !this._counterEl.hidden;
        this._metaEl.hidden = !hasHint && !hasCounter;
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    private static _uid = 0;

    private static _css = `
        :host {
            display: block;
        }

        .field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            position: relative;
        }

        .label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-muted, #94a3b8);
        }

        .label[hidden] {
            display: none;
        }

        .input {
            width: 100%;
            padding: 7px 10px;
            font-size: 12px;
            font-weight: 500;
            color: var(--text-main, #1e293b);
            font-family: inherit;
            border: 1px solid var(--border-default, #e2e8f0);
            border-radius: 8px;
            background: var(--bg-surface, #fff);
            outline: none;
            box-sizing: border-box;
        }

        @media (prefers-reduced-motion: no-preference) {
            .input { transition: border-color 0.15s, box-shadow 0.15s; }
        }

        .input::placeholder {
            color: var(--text-muted, #94a3b8);
            font-weight: 400;
        }

        .input:hover:not(:disabled) {
            border-color: var(--text-muted, #94a3b8);
        }

        .input:focus-visible {
            border-color: var(--primary-base, #4361ee);
            box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
        }

        .input[aria-invalid="true"] {
            border-color: var(--danger-base, #ef4444);
        }

        .input[aria-invalid="true"]:focus-visible {
            box-shadow: 0 0 0 3px rgb(239 68 68 / 0.15);
        }

        .input:disabled {
            background: var(--bg-base, #f1f5f9);
            color: var(--text-muted, #94a3b8);
            cursor: not-allowed;
        }

        .meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }

        .meta[hidden] {
            display: none;
        }

        .hint {
            font-size: 11px;
            color: var(--text-muted, #94a3b8);
            line-height: 1.4;
            flex: 1;
            min-width: 0;
        }

        .hint[data-level="error"] {
            color: var(--danger-base, #ef4444);
        }

        .hint[data-level="success"] {
            color: var(--success-base, #10b981);
        }

        .counter {
            font-size: 11px;
            color: var(--text-muted, #94a3b8);
            font-variant-numeric: tabular-nums;
            flex-shrink: 0;
        }

        .counter[hidden] {
            display: none;
        }

        .counter[data-over="true"] {
            color: var(--danger-base, #ef4444);
            font-weight: 600;
        }
    `;
}

if (!customElements.get("p9r-input")) {
    customElements.define("p9r-input", P9rInput);
}
