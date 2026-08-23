import css from "./MediaInput.css" with { type: "text" };
import { upgradeProperty } from "@bernouy/components/base";
import type { MediaCenter } from "cms-control/components/media/MediaCenter/MediaCenter";

/**
 * `<cms-media-input name label value types size>` — a form-associated file
 * picker rendered as a square preview tile (default 64×64), not a text input.
 * Replaces a plain URL `<input>` for fields that should point at a file from
 * the media library (favicon, logo…). Clicking the tile opens
 * `<cms-media-center>`; the picked file's absolute URL is the form value, so
 * the backend stays unchanged.
 *
 * `types` is a comma-separated MediaCenter filter (default `image`); `folder`
 * is always added so the picker can be navigated. `size` sets the tile edge in
 * px (default 64).
 */
export class MediaInput extends HTMLElement {
    static formAssociated = true;
    static readonly observedAttributes = ["value", "label", "size", "disabled"];

    private _internals: ElementInternals;
    private _value = "";
    private _defaultValue = "";
    private _tile!: HTMLButtonElement;
    private _preview!: HTMLImageElement;
    private _clearBtn!: HTMLElement;
    private _label!: HTMLElement;

    constructor() {
        super();
        this._internals = this.attachInternals();
    }

    connectedCallback() {
        if (!this.shadowRoot) {
            this._build();
            this._wire();
        }
        for (const property of ["value", "disabled"]) {
            upgradeProperty(this, property);
        }
        const value = this.getAttribute("value") ?? this._value;
        this._defaultValue = value;
        this._setValue(value);
        this._syncAttributes();
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
        if (name === "value") {
            const value = newValue ?? "";
            this._defaultValue = value;
            this._setValue(value);
            return;
        }
        if (this.shadowRoot) {
            this._syncAttributes();
        }
    }

    formResetCallback() {
        this._setValue(this._defaultValue);
    }

    get name() {
        return this.getAttribute("name");
    }
    get value() {
        return this._value;
    }
    set value(v: string) {
        this._setValue(v);
    }
    get disabled() {
        return this.hasAttribute("disabled");
    }
    set disabled(value: boolean) {
        this.toggleAttribute("disabled", value);
    }

    private get _types(): string[] {
        const raw = this.getAttribute("types") || "image";
        return [
            "folder",
            ...raw
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
        ];
    }

    private _build() {
        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <style>${css}</style>
            <div class="field">
                <span class="label"></span>
                <button class="tile" type="button" title="Choose a file">
                    <img class="preview" alt="" />
                    <span class="placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="9" cy="9" r="1.6"/>
                            <path d="m21 15-4.5-4.5L5 21"/>
                        </svg>
                    </span>
                    <span class="clear" title="Remove" role="button" aria-label="Remove">
                        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
                            stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </span>
                </button>
            </div>`;
        this._tile = shadow.querySelector(".tile") as HTMLButtonElement;
        this._preview = shadow.querySelector(".preview") as HTMLImageElement;
        this._clearBtn = shadow.querySelector(".clear") as HTMLElement;
        this._label = shadow.querySelector(".label") as HTMLElement;
    }

    private _wire() {
        this._tile.addEventListener("click", () => this._openPicker());
        this._clearBtn.addEventListener("click", (e) => {
            e.stopPropagation(); // don't also open the picker
            this.value = "";
            this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        });
    }

    private _openPicker() {
        const center = document.createElement("cms-media-center") as MediaCenter;
        document.body.appendChild(center);
        const handler = (e: Event) => {
            center.removeEventListener("select-item", handler);
            const src = (e as CustomEvent).detail?.src as string | undefined;
            if (src) {
                this.value = src;
                this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            }
            center.remove();
        };
        center.addEventListener("select-item", handler);
        center.show(this._types);
    }

    private _setValue(value: string) {
        this._value = value;
        this._internals.setFormValue(value);
        if (!this._preview) {
            return;
        }
        if (value) {
            this._preview.src = value;
        } else {
            this._preview.removeAttribute("src");
        }
        this._tile.classList.toggle("has-value", value !== "");
        this._clearBtn.style.display = value ? "flex" : "none";
    }

    private _syncAttributes() {
        if (!this._tile) {
            return;
        }
        const label = this.getAttribute("label") ?? "";
        const size = Number.parseInt(this.getAttribute("size") ?? "64", 10);
        this._label.textContent = label;
        this._label.hidden = label === "";
        this._tile.disabled = this.disabled;
        this._tile.parentElement?.style.setProperty("--tile-size", `${size > 0 ? size : 64}px`);
    }
}

if (!customElements.get("cms-media-input")) {
    customElements.define("cms-media-input", MediaInput);
}
