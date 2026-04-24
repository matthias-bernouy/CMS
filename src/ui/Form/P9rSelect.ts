/**
 * <p9r-select name="variant" label="Variant">
 *     <option value="elevated" selected>Elevated</option>
 *     <option value="outline">Outline</option>
 *     <option value="ghost">Ghost</option>
 * </p9r-select>
 */
export class P9rSelect extends HTMLElement {

    private _trigger: HTMLElement | null = null;
    private _display: HTMLElement | null = null;
    private _list: HTMLElement | null = null;
    private _panel: HTMLElement | null = null;
    private _options: HTMLElement[] = [];
    private _isOpen = false;
    private _value = "";

    // Stable handler refs so disconnectedCallback can pair add/remove.
    // An arrow literal in connectedCallback would leak one window listener
    // per re-connect (moving the element around, switching modes, etc.).
    private _onWindowClick = (e: MouseEvent) => {
        if (this._isOpen && !this.contains(e.target as Node)) this._close();
    };
    private _onTriggerClick = (e: MouseEvent) => {
        e.stopPropagation();
        this._isOpen ? this._close() : this._open();
    };
    private _onTriggerKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") this._close();
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this._isOpen ? this._close() : this._open();
        }
    };
    private _onSlotChange = () => this._syncFromSlot();

    constructor() {
        super();
        // Shadow is built once, in the constructor — attachShadow throws on
        // the second call, which used to crash whenever the custom element
        // was re-connected after a reparenting.
        this._buildShadow();
    }

    connectedCallback() {
        const slot = this.shadowRoot!.querySelector("slot") as HTMLSlotElement;
        slot.addEventListener("slotchange", this._onSlotChange);
        this._trigger!.addEventListener("click", this._onTriggerClick);
        this._trigger!.addEventListener("keydown", this._onTriggerKeyDown);
        window.addEventListener("click", this._onWindowClick);
        // A reconnect doesn't fire slotchange, so sync explicitly.
        this._syncFromSlot();
    }

    disconnectedCallback() {
        const slot = this.shadowRoot!.querySelector("slot") as HTMLSlotElement | null;
        slot?.removeEventListener("slotchange", this._onSlotChange);
        this._trigger?.removeEventListener("click", this._onTriggerClick);
        this._trigger?.removeEventListener("keydown", this._onTriggerKeyDown);
        window.removeEventListener("click", this._onWindowClick);
    }

    private _buildShadow() {
        const label = this.getAttribute("label") || this.getAttribute("name") || "";

        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <style>${P9rSelect._css}</style>
            <div class="field">
                <span class="label">${label}</span>
                <button class="trigger" type="button" tabindex="0">
                    <span class="value"></span>
                    <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m6 9 6 6 6-6"/>
                    </svg>
                </button>
                <div class="panel">
                    <ul class="list"></ul>
                </div>
            </div>
            <div hidden><slot></slot></div>
        `;

        this._trigger = shadow.querySelector(".trigger")!;
        this._display = shadow.querySelector(".value")!;
        this._list = shadow.querySelector(".list")!;
        this._panel = shadow.querySelector(".panel")!;
    }

    private _syncFromSlot() {
        const nativeOptions = Array.from(this.querySelectorAll("option")) as HTMLOptionElement[];
        this._list!.innerHTML = "";
        this._options = [];

        let initialValue = "";
        let initialLabel = "";

        nativeOptions.forEach((opt) => {
            const li = document.createElement("li");
            li.className = "option";
            li.textContent = opt.textContent;
            li.dataset.value = opt.value;

            li.addEventListener("click", () => this._select(opt.value, opt.textContent || ""));

            this._list!.appendChild(li);
            this._options.push(li);

            if (opt.hasAttribute("selected") && !initialValue) {
                initialValue = opt.value;
                initialLabel = opt.textContent || "";
            }
        });

        if (initialValue) {
            this._setValue(initialValue, initialLabel);
        } else if (nativeOptions.length > 0) {
            this._setValue(nativeOptions[0]!.value, nativeOptions[0]!.textContent || "");
        }
    }

    private _select(value: string, label: string) {
        this._setValue(value, label);
        this._close();
        this.dispatchEvent(new Event("change", { bubbles: true }));
    }

    private _setValue(value: string, label: string) {
        this._value = value;
        this._display!.textContent = label;
        this._options.forEach(li => {
            li.classList.toggle("selected", li.dataset.value === value);
        });
    }

    private _open() {
        // Close all other open P9rSelect dropdowns
        document.querySelectorAll("p9r-select").forEach((el) => {
            if (el !== this) (el as P9rSelect)._close();
        });

        this._isOpen = true;
        this._panel!.classList.add("open");
        this._trigger!.classList.add("open");
    }

    private _close() {
        this._isOpen = false;
        this._panel!.classList.remove("open");
        this._trigger!.classList.remove("open");
    }

    get value() { return this._value; }
    set value(v: string) {
        const li = this._options.find(o => o.dataset.value === v);
        if (li) this._setValue(v, li.textContent || "");
    }

    get name() { return this.getAttribute("name"); }

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

        .trigger {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            width: 100%;
            padding: 7px 10px;
            border: 1px solid var(--border-default, #e2e8f0);
            border-radius: 8px;
            background: var(--bg-surface, #fff);
            cursor: pointer;
            transition: border-color 0.15s, box-shadow 0.15s;
            outline: none;
        }

        .trigger:hover {
            border-color: var(--text-muted, #94a3b8);
        }

        .trigger:focus-visible {
            border-color: var(--primary-base, #4361ee);
            box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
        }

        .trigger.open {
            border-color: var(--primary-base, #4361ee);
        }

        .value {
            font-size: 12px;
            font-weight: 500;
            color: var(--text-main, #1e293b);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .chevron {
            flex-shrink: 0;
            color: var(--text-muted, #94a3b8);
            transition: transform 0.2s ease;
        }

        .trigger.open .chevron {
            transform: rotate(180deg);
            color: var(--primary-base, #4361ee);
        }

        /* ── Dropdown ── */

        .panel {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            margin-top: 4px;
            background: var(--bg-surface, #fff);
            border: 1px solid var(--border-default, #e2e8f0);
            border-radius: 8px;
            box-shadow: 0 8px 20px rgb(0 0 0 / 0.08);
            z-index: 50;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-4px);
            transition: opacity 0.15s, visibility 0.15s, transform 0.15s;
            overflow: hidden;
        }

        .panel.open {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        .list {
            list-style: none;
            margin: 0;
            padding: 4px;
            max-height: 200px;
            overflow-y: auto;
        }

        .option {
            padding: 6px 10px;
            font-size: 12px;
            font-weight: 500;
            color: var(--text-main, #1e293b);
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.1s;
        }

        .option:hover {
            background: var(--bg-base, #f1f5f9);
        }

        .option.selected {
            background: var(--primary-muted, rgb(67 97 238 / 0.1));
            color: var(--primary-base, #4361ee);
            font-weight: 600;
        }
    `;
}

if (!customElements.get("p9r-select")) {
    customElements.define("p9r-select", P9rSelect);
}
