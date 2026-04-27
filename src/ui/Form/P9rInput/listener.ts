import { updateCounter } from './compute';

export const handleInput = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    internals: ElementInternals,
    counter: HTMLElement | null,
    countEl: HTMLElement | null,
) => {
    if (!input) return;
    internals.setFormValue(input.value);
    updateCounter(host, input, counter, countEl);
};

export const handleChange = (input: HTMLInputElement | null, internals: ElementInternals) => {
    if (!input) return;
    internals.setFormValue(input.value);
};
