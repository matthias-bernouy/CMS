import { refreshMetaVisibility } from "./compute";
import { syncDescription } from "./description";
import { syncHint, syncHintLevel, syncInvalid } from "./sync";

type InputValidityElements = {
    input: HTMLInputElement | null;
    hint: HTMLElement | null;
    meta: HTMLElement | null;
    counter: HTMLElement | null;
};

export function syncInputValidity(
    host: HTMLElement,
    internals: ElementInternals,
    elements: InputValidityElements,
    showMessage: boolean,
): void {
    const { input, hint, meta, counter } = elements;
    if (!input) {
        return;
    }

    const validationMessage = input.validationMessage || "Please enter a valid value.";
    if (input.validity.valid) {
        internals.setValidity({});
    } else {
        internals.setValidity(input.validity, validationMessage, input);
    }

    if (showMessage && !input.validity.valid) {
        input.setAttribute("aria-invalid", "true");
        if (hint) {
            hint.textContent = validationMessage;
            hint.dataset.level = "error";
        }
        refreshMetaVisibility(hint, counter, meta);
        syncDescription(input, hint, counter);
        return;
    }

    syncHint(host, hint, counter, meta);
    syncHintLevel(host, hint);
    syncInvalid(host, input);
    syncDescription(input, hint, counter);
}
