import { updateCounter, autosize } from './compute';

export const handleInput = (
    host: HTMLElement,
    textarea: HTMLTextAreaElement | null,
    internals: ElementInternals,
    counter: HTMLElement | null,
    countEl: HTMLElement | null,
) => {
    if (!textarea) return;
    internals.setFormValue(textarea.value);
    updateCounter(host, textarea, counter, countEl);
    autosize(host, textarea);
};

export const handleChange = (
    textarea: HTMLTextAreaElement | null,
    internals: ElementInternals,
) => {
    if (!textarea) return;
    internals.setFormValue(textarea.value);
};
