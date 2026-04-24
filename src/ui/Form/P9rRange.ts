export class P9rRange extends HTMLElement {

    static formAssociated = true;

    static get observedAttributes() {
        return ["value", "label", "min", "max", "step", "unit", "disabled"];
    }

    private _internals: ElementInternals;
    private _slider: HTMLInputElement | null;
    private _input: HTMLInputElement | null;
    private _fill: HTMLElement | null;
    private _labelEl: HTMLElement | null;
    private _unitEl: HTMLElement | null;
    private _minEl: HTMLElement | null;
    private _maxEl: HTMLElement | null;

    constructor() {
        super();
        this._internals = this.attachInternals();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <style>${P9rRange._css}</style>
            <div class="field" part="field">
                <div class="header" part="header">
                    <span class="label" part="label"></span>
                    <div class="input-wrap" part="input-wrap">
                        <input class="number" part="number-input" type="number">
                        <span class="unit" part="unit" hidden></span>
                    </div>
                </div>
                <div class="track-container" part="track-container">
                    <div class="track" part="track">
                        <div class="fill" part="fill"></div>
                    </div>
                    <input class="slider" part="slider" type="range">
                </div>
                <div class="bounds" part="bounds">
                    <span class="min-bound"></span>
                    <span class="max-bound"></span>
                </div>
            </div>
        `;

        this._slider = shadow.querySelector(".slider");
        this._input = shadow.querySelector(".number");
        this._fill = shadow.querySelector(".fill");
        this._labelEl = shadow.querySelector(".label");
        this._unitEl = shadow.querySelector(".unit");
        this._minEl = shadow.querySelector(".min-bound");
        this._maxEl = shadow.querySelector(".max-bound");
    }

    connectedCallback() {
        for (const prop of ["value", "disabled"]) {
            this._upgradeProperty(prop);
        }

        this._syncLabel();
        this._syncBounds();
        this._syncUnit();
        this._syncDisabled();
        this._syncValue(this.getAttribute("value") ?? this.getAttribute("min") ?? "0");

        this._slider?.addEventListener("input", this._onSliderInput);
        this._slider?.addEventListener("change", this._onSliderChange);
        this._input?.addEventListener("input", this._onNumberInput);
        this._input?.addEventListener("change", this._onNumberChange);
        this._input?.addEventListener("blur", this._onNumberBlur);
    }

    disconnectedCallback() {
        this._slider?.removeEventListener("input", this._onSliderInput);
        this._slider?.removeEventListener("change", this._onSliderChange);
        this._input?.removeEventListener("input", this._onNumberInput);
        this._input?.removeEventListener("change", this._onNumberChange);
        this._input?.removeEventListener("blur", this._onNumberBlur);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._slider || !this._input) return;
        switch (name) {
            case "value":    if (newVal !== null) this._syncValue(newVal); break;
            case "label":    this._syncLabel(); break;
            case "min":
            case "max":
            case "step":     this._syncBounds(); this._syncFill(); break;
            case "unit":     this._syncUnit(); break;
            case "disabled": this._syncDisabled(); break;
        }
    }

    get value(): string { return this._slider?.value ?? ""; }
    set value(v: string) { this._syncValue(String(v)); }

    get name(): string { return this.getAttribute("name") ?? ""; }

    get disabled(): boolean { return this.hasAttribute("disabled"); }
    set disabled(v: boolean) {
        if (v) this.setAttribute("disabled", "");
        else this.removeAttribute("disabled");
    }

    override focus() { this._slider?.focus(); }

    private _onSliderInput = () => {
        if (!this._slider || !this._input) return;
        this._input.value = this._slider.value;
        this._internals.setFormValue(this._slider.value);
        this._syncFill();
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    };

    private _onSliderChange = () => {
        if (!this._slider) return;
        this._internals.setFormValue(this._slider.value);
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };

    private _onNumberInput = () => {
        if (!this._slider || !this._input) return;
        const raw = this._input.value;
        if (raw === "") return;
        const clamped = this._clamp(Number(raw));
        this._slider.value = String(clamped);
        this._internals.setFormValue(this._slider.value);
        this._syncFill();
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    };

    private _onNumberChange = () => {
        if (!this._slider || !this._input) return;
        const clamped = this._clamp(Number(this._input.value));
        this._slider.value = String(clamped);
        this._input.value = String(clamped);
        this._internals.setFormValue(this._slider.value);
        this._syncFill();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };

    private _onNumberBlur = () => {
        if (!this._slider || !this._input) return;
        this._input.value = this._slider.value;
    };

    private _clamp(v: number): number {
        if (!this._slider) return v;
        const mn = Number(this._slider.min);
        const mx = Number(this._slider.max);
        if (!Number.isFinite(v)) return mn;
        if (v < mn) return mn;
        if (v > mx) return mx;
        return v;
    }

    private _syncValue(v: string) {
        if (!this._slider || !this._input) return;
        const clamped = this._clamp(Number(v));
        this._slider.value = String(clamped);
        this._input.value = String(clamped);
        this._internals.setFormValue(this._slider.value);
        this._syncFill();
    }

    private _syncBounds() {
        if (!this._slider || !this._input || !this._minEl || !this._maxEl) return;
        const min = this.getAttribute("min") ?? "0";
        const max = this.getAttribute("max") ?? "100";
        const step = this.getAttribute("step") ?? "1";
        this._slider.min = min;
        this._slider.max = max;
        this._slider.step = step;
        this._input.min = min;
        this._input.max = max;
        this._input.step = step;
        this._minEl.textContent = min;
        this._maxEl.textContent = max;
    }

    private _syncLabel() {
        if (!this._labelEl || !this._slider || !this._input) return;
        const label = this.getAttribute("label") ?? this.getAttribute("name") ?? "";
        this._labelEl.textContent = label;
        this._labelEl.hidden = label === "";
        if (label) {
            this._slider.setAttribute("aria-label", label);
            this._input.setAttribute("aria-label", label);
        }
    }

    private _syncUnit() {
        if (!this._unitEl) return;
        const unit = this.getAttribute("unit") ?? "";
        this._unitEl.textContent = unit;
        this._unitEl.hidden = unit === "";
    }

    private _syncDisabled() {
        if (!this._slider || !this._input) return;
        const disabled = this.hasAttribute("disabled");
        this._slider.disabled = disabled;
        this._input.disabled = disabled;
    }

    private _syncFill() {
        if (!this._slider || !this._fill) return;
        const min = Number(this._slider.min);
        const max = Number(this._slider.max);
        const val = Number(this._slider.value);
        const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
        this._fill.style.width = `${pct}%`;
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    private static _css = `
        :host {
            display: block;
        }

        :host([disabled]) {
            opacity: 0.55;
            pointer-events: none;
        }

        .field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
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

        .input-wrap {
            display: flex;
            align-items: center;
            gap: 2px;
            background: var(--bg-surface, #fff);
            border: 1px solid var(--border-default, #e2e8f0);
            border-radius: 6px;
            padding: 2px 6px;
        }

        @media (prefers-reduced-motion: no-preference) {
            .input-wrap { transition: border-color 0.15s; }
            .fill { transition: width 0.05s ease; }
            .slider::-webkit-slider-thumb { transition: transform 0.1s; }
        }

        .input-wrap:focus-within {
            border-color: var(--primary-base, #4361ee);
            box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
        }

        .number {
            width: 36px;
            border: none;
            outline: none;
            background: transparent;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-main, #1e293b);
            text-align: right;
            font-family: inherit;
            -moz-appearance: textfield;
        }

        .number::-webkit-inner-spin-button,
        .number::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }

        .unit {
            font-size: 10px;
            font-weight: 500;
            color: var(--text-muted, #94a3b8);
        }

        .unit[hidden] {
            display: none;
        }

        .track-container {
            position: relative;
            height: 20px;
            display: flex;
            align-items: center;
        }

        .track {
            position: absolute;
            left: 0;
            right: 0;
            height: 4px;
            background: var(--border-default, #e2e8f0);
            border-radius: 4px;
            overflow: hidden;
            pointer-events: none;
        }

        .fill {
            height: 100%;
            background: var(--primary-base, #4361ee);
            border-radius: 4px;
        }

        .slider {
            position: relative;
            width: 100%;
            height: 20px;
            margin: 0;
            -webkit-appearance: none;
            appearance: none;
            background: transparent;
            cursor: pointer;
            z-index: 1;
            outline: none;
        }

        .slider:focus-visible::-webkit-slider-thumb {
            box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.25));
        }

        .slider:focus-visible::-moz-range-thumb {
            box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.25));
        }

        .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: var(--primary-base, #4361ee);
            border: 2px solid var(--bg-surface, #fff);
            box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
            cursor: grab;
        }

        .slider::-webkit-slider-thumb:active {
            transform: scale(1.2);
            cursor: grabbing;
        }

        .slider::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: var(--primary-base, #4361ee);
            border: 2px solid var(--bg-surface, #fff);
            box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
            cursor: grab;
        }

        .slider::-moz-range-track {
            background: transparent;
            border: none;
        }

        .bounds {
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            font-weight: 500;
            color: var(--text-muted, #94a3b8);
            margin-top: -2px;
        }
    `;
}

if (!customElements.get("p9r-range")) {
    customElements.define("p9r-range", P9rRange);
}
