import { updateCounter } from "./compute";

export const handleInput = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    internals: ElementInternals,
    counter: HTMLElement | null,
    countEl: HTMLElement | null,
) => {
    if (!input) {
        return;
    }
    internals.setFormValue(input.value);
    updateCounter(host, input, counter, countEl);
    host.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
};

export const handleChange = (host: HTMLElement, input: HTMLInputElement | null, internals: ElementInternals) => {
    if (!input) {
        return;
    }
    internals.setFormValue(input.value);
    host.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
};
