import css from "./MediaInput.css" with { type: "text" };
import type { MediaCenter } from "cms-control/components/editor/MediaCenter/MediaCenter";

/**
 * `<cms-media-input name label value types placeholder>` — a form-associated
 * file picker. Replaces a plain URL `<input>` for fields that should point at a
 * file from the media library (favicon, logo…). Opens `<cms-media-center>` to
 * pick a file and stores its absolute URL; participates in `cms-form` via
 * `ElementInternals.setFormValue`, so the form submits the URL as a string —
 * the backend stays unchanged.
 *
 * `types` is a comma-separated MediaCenter filter (default `image`); `folder`
 * is always added so the picker can be navigated.
 */
export class MediaInput extends HTMLElement {

    static formAssociated = true;

    private _internals: ElementInternals;
    private _value = "";
    private _preview!: HTMLImageElement;
    private _label!: HTMLElement;
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
        this._preview.style.display = v ? "block" : "none";
        this._label.textContent = v ? fileName(v) : (this.getAttribute("placeholder") || "Choose a file…");
        this._clearBtn.style.display = v ? "flex" : "none";
    }

    private get _types(): string[] {
        const raw = this.getAttribute("types") || "image";
        return ["folder", ...raw.split(",").map(t => t.trim()).filter(Boolean)];
    }

    private _build(label: string | null) {
        const shadow = this.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <style>${css}</style>
            <div class="field">
                ${label ? `<span class="label">${label}</span>` : ""}
                <div class="input-row">
                    <button class="trigger" type="button">
                        <img class="preview" alt="" />
                        <span class="value">Choose a file…</span>
                    </button>
                    <button class="clear-btn" type="button" title="Remove">
                        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>`;
        this._preview  = shadow.querySelector(".preview") as HTMLImageElement;
        this._label    = shadow.querySelector(".value")   as HTMLElement;
        this._clearBtn = shadow.querySelector(".clear-btn") as HTMLElement;
    }

    private _wire() {
        this.shadowRoot!.querySelector(".trigger")!.addEventListener("click", () => this._openPicker());
        this._clearBtn.addEventListener("click", () => {
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

/** Last path segment of a URL, for a compact display label. */
function fileName(url: string): string {
    const clean = url.split("?")[0]!.replace(/\/$/, "");
    return clean.slice(clean.lastIndexOf("/") + 1) || url;
}

if (!customElements.get("cms-media-input")) {
    customElements.define("cms-media-input", MediaInput);
}
