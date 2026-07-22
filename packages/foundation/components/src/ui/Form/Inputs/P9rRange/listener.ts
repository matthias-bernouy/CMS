import { clamp, syncFill } from "./compute";

export const onSliderInput = (
    host: HTMLElement,
    slider: HTMLInputElement | null,
    input: HTMLInputElement | null,
    fill: HTMLElement | null,
    internals: ElementInternals,
) => {
    if (!slider || !input) {
        return;
    }
    input.value = slider.value;
    internals.setFormValue(slider.value);
    syncFill(slider, fill);
    host.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
};

export const onSliderChange = (host: HTMLElement, slider: HTMLInputElement | null, internals: ElementInternals) => {
    if (!slider) {
        return;
    }
    internals.setFormValue(slider.value);
    host.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
};

export const onNumberInput = (
    host: HTMLElement,
    slider: HTMLInputElement | null,
    input: HTMLInputElement | null,
    fill: HTMLElement | null,
    internals: ElementInternals,
) => {
    if (!slider || !input) {
        return;
    }
    if (input.value === "") {
        return;
    }
    const v = clamp(slider, Number(input.value));
    slider.value = String(v);
    internals.setFormValue(slider.value);
    syncFill(slider, fill);
    host.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
};

export const onNumberChange = (
    host: HTMLElement,
    slider: HTMLInputElement | null,
    input: HTMLInputElement | null,
    fill: HTMLElement | null,
    internals: ElementInternals,
) => {
    if (!slider || !input) {
        return;
    }
    const v = clamp(slider, Number(input.value));
    slider.value = String(v);
    input.value = String(v);
    internals.setFormValue(slider.value);
    syncFill(slider, fill);
    host.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
};

export const onNumberBlur = (slider: HTMLInputElement | null, input: HTMLInputElement | null) => {
    if (!slider || !input) {
        return;
    }
    input.value = slider.value;
};
