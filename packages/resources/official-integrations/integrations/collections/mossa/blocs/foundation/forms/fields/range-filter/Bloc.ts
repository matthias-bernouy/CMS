import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";
import { normalizeRangeValues, readNumericRange, serializeBoundary, type RangeValues } from "./range/values";
import { readRangeMode, renderRange } from "./range/view";

type BoundControl = HTMLElement & { value: string };
type Bound = "minimum" | "maximum";

export class Bloc extends Component {
    static observedAttributes = ["name", "min", "max", "step", "unit", "value-min", "value-max", "label", "mode"];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        for (const input of [this.minimumHandle, this.maximumHandle]) {
            input.addEventListener("input", this.onHandleEvent);
            input.addEventListener("change", this.onHandleEvent);
        }
        for (const slot of this.shadowRoot!.querySelectorAll("slot")) {
            slot.addEventListener("slotchange", this.onSlotChange);
        }
        this.addEventListener("input", this.onControlInput, true);
        this.addEventListener("change", this.onControlChange, true);
        this.addEventListener("mossa-input:value-set", this.onControlValueSet);
        queueMicrotask(this.syncFromControls);
    }

    disconnectedCallback(): void {
        for (const input of [this.minimumHandle, this.maximumHandle]) {
            input.removeEventListener("input", this.onHandleEvent);
            input.removeEventListener("change", this.onHandleEvent);
        }
        for (const slot of this.shadowRoot!.querySelectorAll("slot")) {
            slot.removeEventListener("slotchange", this.onSlotChange);
        }
        this.removeEventListener("input", this.onControlInput, true);
        this.removeEventListener("change", this.onControlChange, true);
        this.removeEventListener("mossa-input:value-set", this.onControlValueSet);
    }

    attributeChangedCallback(name: string): void {
        if (!this.isConnected) {
            return;
        }
        if (["min", "max", "step", "mode"].includes(name)) {
            this.syncFromControls();
        } else {
            this.render();
        }
    }

    /** Exposed for form collectors:
     *  serialize the current double-range as a single `"lo-hi"` string so
     *  it round-trips through a URLSearchParams entry. */
    get value(): string {
        const range = readNumericRange(this);
        const values = this.attributeValues(range);
        if (this.mode === "max") {
            return serializeBoundary(values.maximum, range.maximum);
        }
        if (this.mode === "min") {
            return serializeBoundary(values.minimum, range.minimum);
        }
        const minimum = serializeBoundary(values.minimum, range.minimum);
        const maximum = serializeBoundary(values.maximum, range.maximum);
        return minimum || maximum ? `${minimum}-${maximum}` : "";
    }

    /** Accept a `"lo-hi"` string back from URL sync / form.reset. Empty
     *  or malformed input snaps the host back to its declared min/max. */
    set value(v: string) {
        const range = readNumericRange(this);
        if (this.mode === "max") {
            this.applyValues(normalizeRangeValues(range.minimum, v, range));
            return;
        }
        if (this.mode === "min") {
            this.applyValues(normalizeRangeValues(v, range.maximum, range));
            return;
        }
        const match = /^\s*(-?(?:\d+(?:\.\d+)?|\.\d+)?)\s*-\s*(-?(?:\d+(?:\.\d+)?|\.\d+)?)\s*$/.exec(String(v ?? ""));
        this.applyValues(normalizeRangeValues(match?.[1], match?.[2], range));
    }

    private readonly onSlotChange = (): void => this.syncFromControls();

    private readonly onControlInput = (event: Event): void => {
        const bound = this.boundForControl(event.target);
        if (bound) {
            event.stopPropagation();
            this.previewFromControls(bound);
        }
    };

    private readonly onControlChange = (event: Event): void => {
        const bound = this.boundForControl(event.target);
        if (bound) {
            this.syncFromControls(bound);
        }
    };

    private readonly onControlValueSet = (event: Event): void => {
        const bound = this.boundForControl(event.target);
        if (bound) {
            this.syncFromControls(bound);
        }
    };

    private readonly onHandleEvent = (event: Event): void => {
        event.stopPropagation();
        const bound: Bound = event.currentTarget === this.minimumHandle ? "minimum" : "maximum";
        const range = readNumericRange(this);
        const values = normalizeRangeValues(this.minimumHandle.value, this.maximumHandle.value, range, bound);
        this.applyValues(values);
        const control = this.control(bound);
        if (control) {
            const boundary = bound === "minimum" ? range.minimum : range.maximum;
            control.value = serializeBoundary(values[bound], boundary);
            if (event.type === "change") {
                control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            }
        } else if (event.type === "change") {
            this.dispatchEvent(
                new CustomEvent("change", {
                    detail: values,
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    };

    private readonly syncFromControls = (changed?: Bound): void => {
        const range = readNumericRange(this);
        const minimumControl = this.control("minimum");
        const maximumControl = this.control("maximum");
        const hasControls = Boolean(minimumControl || maximumControl);
        const minimum = hasControls ? minimumControl?.value : this.getAttribute("value-min");
        const maximum = hasControls ? maximumControl?.value : this.getAttribute("value-max");
        const values = normalizeRangeValues(minimum, maximum, range, changed);
        this.applyValues(values);
        this.toggleAttribute(
            "has-value-controls",
            Boolean((minimumControl && !minimumControl.hidden) || (maximumControl && !maximumControl.hidden)),
        );
        if (changed) {
            const control = this.control(changed);
            if (control) {
                const boundary = changed === "minimum" ? range.minimum : range.maximum;
                const normalized = serializeBoundary(values[changed], boundary);
                if (control.value !== normalized) {
                    control.value = normalized;
                }
            }
        }
    };

    private previewFromControls(changed: Bound): void {
        const range = readNumericRange(this);
        const control = this.control(changed);
        const raw = control?.value.trim() || "";
        const candidate = Number(raw);
        if (raw && (!Number.isFinite(candidate) || candidate < range.minimum || candidate > range.maximum)) {
            return;
        }
        this.applyValues(
            normalizeRangeValues(this.control("minimum")?.value, this.control("maximum")?.value, range, changed),
        );
    }

    private applyValues(values: RangeValues): void {
        this.setAttribute("value-min", String(values.minimum));
        this.setAttribute("value-max", String(values.maximum));
        this.render();
    }

    private render(): void {
        const range = readNumericRange(this);
        const values = this.attributeValues(range);
        renderRange(this, this.shadowRoot!, values, range, this.mode);
    }

    private attributeValues(range = readNumericRange(this)): RangeValues {
        return normalizeRangeValues(this.getAttribute("value-min"), this.getAttribute("value-max"), range);
    }

    private boundForControl(target: EventTarget | null): Bound | null {
        return target === this.control("minimum") ? "minimum" : target === this.control("maximum") ? "maximum" : null;
    }

    private control(bound: Bound): BoundControl | null {
        const control = this.querySelector<HTMLElement>(`[slot="${bound}"]`);
        return control && "value" in control ? (control as BoundControl) : null;
    }

    private get mode() {
        return readRangeMode(this);
    }

    private get minimumHandle(): HTMLInputElement {
        return this.shadowRoot!.querySelector<HTMLInputElement>(".input-min")!;
    }

    private get maximumHandle(): HTMLInputElement {
        return this.shadowRoot!.querySelector<HTMLInputElement>(".input-max")!;
    }
}
