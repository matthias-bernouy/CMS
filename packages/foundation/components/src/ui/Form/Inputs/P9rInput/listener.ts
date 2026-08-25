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
};

export const handleChange = (host: HTMLElement, input: HTMLInputElement | null, internals: ElementInternals) => {
    if (!input) {
        return;
    }
    internals.setFormValue(input.value);
    host.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
};

export function handleEnterSubmit(
    host: HTMLElement,
    input: HTMLInputElement | null,
    internals: ElementInternals,
    event: KeyboardEvent,
): void {
    if (!shouldSubmitOnEnter(event, input)) {
        return;
    }
    const form = internals.form;
    queueMicrotask(() => {
        if (!event.defaultPrevented && host.isConnected && form === internals.form) {
            form?.requestSubmit();
        }
    });
}

function shouldSubmitOnEnter(event: KeyboardEvent, input: HTMLInputElement | null): boolean {
    if (event.key !== "Enter" || event.isComposing || !input || input.disabled || input.readOnly) {
        return false;
    }
    return ["text", "search", "url", "tel", "email", "password", "number"].includes(input.type);
}
