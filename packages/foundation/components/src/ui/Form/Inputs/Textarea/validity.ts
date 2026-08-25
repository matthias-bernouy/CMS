import { refreshMetaVisibility } from "./compute";
import { syncDescription, syncHint, syncHintLevel, syncInvalid } from "./sync";

type TextareaValidityElements = {
    textarea: HTMLTextAreaElement | null;
    hint: HTMLElement | null;
    meta: HTMLElement | null;
    counter: HTMLElement | null;
};

export function syncTextareaValidity(
    host: HTMLElement,
    internals: ElementInternals,
    elements: TextareaValidityElements,
    showValidationMessage: boolean,
): boolean {
    const { textarea, hint, meta, counter } = elements;
    if (!textarea) {
        return showValidationMessage;
    }
    const message = textarea.validationMessage || "Please enter a valid value.";
    if (textarea.validity.valid) {
        internals.setValidity({});
        showValidationMessage = false;
    } else {
        internals.setValidity(textarea.validity, message, textarea);
    }
    if (showValidationMessage && !textarea.validity.valid) {
        textarea.setAttribute("aria-invalid", "true");
        if (hint) {
            hint.textContent = message;
            hint.dataset.level = "error";
        }
        refreshMetaVisibility(hint, counter, meta);
    } else {
        syncHint(host, hint, counter, meta);
        syncHintLevel(host, hint);
        syncInvalid(host, textarea);
    }
    syncDescription(textarea, hint, counter);
    return showValidationMessage;
}
