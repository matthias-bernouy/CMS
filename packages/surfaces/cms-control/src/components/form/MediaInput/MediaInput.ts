import css from "./MediaInput.css" with { type: "text" };
import { upgradeProperty } from "@bernouy/components/base";
import type { MediaCenter } from "cms-control/components/media/MediaCenter/MediaCenter";
import { mediaInputTemplate } from "./template";

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
    static readonly observedAttributes = ["value", "label", "aria-label", "size", "disabled"];

    private _internals: ElementInternals;
    private _value = "";
    private _defaultValue = "";
    private _tile!: HTMLButtonElement;
    private _preview!: HTMLImageElement;
    private _clearBtn!: HTMLButtonElement;
    private _label!: HTMLLabelElement;

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

    override focus(): void {
        this._tile?.focus();
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
        shadow.innerHTML = `<style>${css}</style>${mediaInputTemplate}`;
        this._tile = shadow.querySelector(".tile") as HTMLButtonElement;
        this._preview = shadow.querySelector(".preview") as HTMLImageElement;
        this._clearBtn = shadow.querySelector(".clear") as HTMLButtonElement;
        this._label = shadow.querySelector(".label") as HTMLLabelElement;
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
        this._clearBtn.disabled = this.disabled;
        const accessibleName = this.getAttribute("aria-label");
        if (accessibleName) {
            this._tile.setAttribute("aria-label", accessibleName);
        } else {
            this._tile.removeAttribute("aria-label");
        }
        this._clearBtn.setAttribute("aria-label", label ? `Remove ${label}` : "Remove selected file");
        this._tile.parentElement?.style.setProperty("--tile-size", `${size > 0 ? size : 64}px`);
    }
}

if (!customElements.get("cms-media-input")) {
    customElements.define("cms-media-input", MediaInput);
}
