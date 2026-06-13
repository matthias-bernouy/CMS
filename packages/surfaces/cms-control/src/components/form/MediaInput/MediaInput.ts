import css from "./MediaInput.css" with { type: "text" };
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

    private _internals: ElementInternals;
    private _value = "";
    private _tile!: HTMLElement;
    private _preview!: HTMLImageElement;
    private _clearBtn!: HTMLElement;

    constructor() {
        super();
        this._internals = this.attachInternals();
    }

    connectedCallback() {
        if (!this.shadowRoot) {
            this._build(this.getAttribute("label"));
            this._wire();
        }
        this.value = this._value || this.getAttribute("value") || "";
    }

    get name()  { return this.getAttribute("name"); }
    get value() { return this._value; }
    set value(v: string) {
        this._value = v;
        this._internals.setFormValue(v);
        this._preview.src = v;
        this._tile.classList.toggle("has-value", !!v);
        this._clearBtn.style.display = v ? "flex" : "none";
    }

    private get _types(): string[] {
        const raw = this.getAttribute("types") || "image";
        return ["folder", ...raw.split(",").map(t => t.trim()).filter(Boolean)];
    }

    private _build(label: string | null) {
        const shadow = this.attachShadow({ mode: "open" });
        const size = this.getAttribute("size") || "64";
        shadow.innerHTML = `
            <style>${css}</style>
            <div class="field" style="--tile-size:${size}px">
                ${label ? `<span class="label">${label}</span>` : ""}
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
        this._tile     = shadow.querySelector(".tile")    as HTMLElement;
        this._preview  = shadow.querySelector(".preview") as HTMLImageElement;
        this._clearBtn = shadow.querySelector(".clear")   as HTMLElement;
    }

    private _wire() {
        this._tile.addEventListener("click", () => this._openPicker());
        this._clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();                 // don't also open the picker
            this.value = "";
            this.dispatchEvent(new Event("change", { bubbles: true }));
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
                this.dispatchEvent(new Event("change", { bubbles: true }));
            }
            center.remove();
        };
        center.addEventListener("select-item", handler);
        center.show(this._types);
    }
}

if (!customElements.get("cms-media-input")) {
    customElements.define("cms-media-input", MediaInput);
}
