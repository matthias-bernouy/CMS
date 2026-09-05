import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["name", "min", "max", "step", "unit", "value-min", "value-max", "label", "mode"];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const minInput = this.shadowRoot!.querySelector(".input-min") as HTMLInputElement;
        const maxInput = this.shadowRoot!.querySelector(".input-max") as HTMLInputElement;
        minInput.addEventListener("input", this._onChange);
        maxInput.addEventListener("input", this._onChange);
        this._sync();
    }

    disconnectedCallback(): void {
        const minInput = this.shadowRoot!.querySelector(".input-min") as HTMLInputElement;
        const maxInput = this.shadowRoot!.querySelector(".input-max") as HTMLInputElement;
        minInput?.removeEventListener("input", this._onChange);
        maxInput?.removeEventListener("input", this._onChange);
    }

    attributeChangedCallback() {
        if (this.shadowRoot) {
            this._sync();
        }
    }

    /** Exposed for form collectors:
     *  serialize the current double-range as a single `"lo-hi"` string so
     *  it round-trips through a URLSearchParams entry. */
    get value(): string {
        if (this.getAttribute("mode") === "max") {
            return this.getAttribute("value-max") ?? "";
        }
        const lo = this.getAttribute("value-min") ?? "";
        const hi = this.getAttribute("value-max") ?? "";
        return `${lo}-${hi}`;
    }

    /** Accept a `"lo-hi"` string back from URL sync / form.reset. Empty
     *  or malformed input snaps the host back to its declared min/max. */
    set value(v: string) {
        const min = Number(this.getAttribute("min") ?? 0);
        const max = Number(this.getAttribute("max") ?? 100);
        if (this.getAttribute("mode") === "max") {
            const requested = String(v ?? "").trim() === "" ? max : Number(v);
            const hi = Number.isFinite(requested) ? Math.min(max, Math.max(min, requested)) : max;
            this.setAttribute("value-min", String(min));
            this.setAttribute("value-max", String(hi));
            return;
        }
        const parts = String(v ?? "").split("-");
        const lo = parts.length === 2 && parts[0] !== "" ? Number(parts[0]) : min;
        const hi = parts.length === 2 && parts[1] !== "" ? Number(parts[1]) : max;
        this.setAttribute("value-min", String(lo));
        this.setAttribute("value-max", String(hi));
    }

    private _onChange = () => {
        const minInput = this.shadowRoot!.querySelector(".input-min") as HTMLInputElement;
        const maxInput = this.shadowRoot!.querySelector(".input-max") as HTMLInputElement;
        const singleMaximum = this.getAttribute("mode") === "max";
        let lo = singleMaximum ? Number(this.getAttribute("min") ?? 0) : Number(minInput.value);
        let hi = Number(maxInput.value);
        if (lo > hi) {
            [lo, hi] = [hi, lo];
        }
        this.setAttribute("value-min", String(lo));
        this.setAttribute("value-max", String(hi));
        this._sync();
        // `composed: true` so the event crosses any wrapping shadow boundary
        // (e.g. when the slider is itself slotted into another bloc) — the
        // host's `dispatchEvent` already originates in light DOM, but
        // keeping it composed matches what other form inputs do.
        this.dispatchEvent(
            new CustomEvent("change", {
                detail: { min: lo, max: hi },
                bubbles: true,
                composed: true,
            }),
        );
    };

    private _sync() {
        const root = this.shadowRoot!;
        const min = Number(this.getAttribute("min") ?? 0);
        const max = Number(this.getAttribute("max") ?? 100);
        const step = Number(this.getAttribute("step") ?? 1);
        const requestedLo = Math.min(max, Math.max(min, Number(this.getAttribute("value-min") ?? min)));
        const requestedHi = Math.min(max, Math.max(min, Number(this.getAttribute("value-max") ?? max)));
        const lo = Math.min(requestedLo, requestedHi);
        const hi = Math.max(requestedLo, requestedHi);
        const unit = this.getAttribute("unit") ?? "";
        const label = this.getAttribute("label") ?? "";
        const singleMaximum = this.getAttribute("mode") === "max";

        const minInput = root.querySelector(".input-min") as HTMLInputElement;
        const maxInput = root.querySelector(".input-max") as HTMLInputElement;
        const range = root.querySelector(".range") as HTMLElement;
        const labelEl = root.querySelector(".label") as HTMLElement;

        minInput.min = String(min);
        minInput.max = String(max);
        minInput.step = String(step);
        minInput.value = String(singleMaximum ? min : lo);
        maxInput.min = String(min);
        maxInput.max = String(max);
        maxInput.step = String(step);
        maxInput.value = String(hi);

        const span = max - min || 1;
        const left = (((singleMaximum ? min : lo) - min) / span) * 100;
        const right = ((hi - min) / span) * 100;
        range.style.setProperty("--_mossa-lo", left + "%");
        range.style.setProperty("--_mossa-hi", right + "%");

        labelEl.textContent = singleMaximum
            ? `${label ? label + " : " : ""}${hi}${unit}`
            : `${label ? label + " : " : ""}${lo}${unit} — ${hi}${unit}`;
    }
}
