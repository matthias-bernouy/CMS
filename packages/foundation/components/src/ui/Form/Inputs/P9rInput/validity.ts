import { refreshMetaVisibility } from "./compute";
import { syncDescription } from "./feedback";

export type InputValidityElements = {
    input: HTMLInputElement | null;
    hint: HTMLElement | null;
    error: HTMLElement | null;
    meta: HTMLElement | null;
    counter: HTMLElement | null;
};

export class InputValidityController {
    private showNativeMessage = false;

    constructor(
        private readonly host: HTMLElement,
        private readonly internals: ElementInternals,
        private readonly elements: InputValidityElements,
    ) {}

    connect(): void {
        this.host.addEventListener("invalid", this.onInvalid);
        this.sync();
    }

    disconnect(): void {
        this.host.removeEventListener("invalid", this.onInvalid);
    }

    reset(): void {
        this.showNativeMessage = false;
        this.sync();
    }

    sync(): void {
        const { input, hint, error, meta, counter } = this.elements;
        if (!input || !hint || !error) {
            return;
        }

        const customMessage = this.customMessage;
        const nativeMessage = standardValidationMessage(input);
        if (customMessage) {
            this.internals.setValidity({ customError: true }, customMessage, input);
        } else if (!input.validity.valid) {
            this.internals.setValidity(input.validity, nativeMessage, input);
        } else {
            this.internals.setValidity({});
            this.showNativeMessage = false;
        }

        const visibleError = customMessage || (this.showNativeMessage && !input.validity.valid ? nativeMessage : "");
        error.textContent = visibleError;
        error.hidden = visibleError === "";

        const hintText = this.host.getAttribute("hint") ?? "";
        hint.textContent = hintText;
        hint.dataset.level = this.host.getAttribute("hint-level") ?? "info";
        hint.hidden = visibleError !== "" || hintText === "";

        const invalid = visibleError !== "" || this.host.hasAttribute("invalid");
        if (invalid) {
            input.setAttribute("aria-invalid", "true");
        } else {
            input.removeAttribute("aria-invalid");
        }
        if (visibleError) {
            input.setAttribute("aria-errormessage", error.id);
        } else {
            input.removeAttribute("aria-errormessage");
        }
        refreshMetaVisibility(hint, error, counter, meta);
        syncDescription(input, hint, error, counter);
    }

    get validity(): ValidityState {
        const validity = this.elements.input?.validity ?? validState();
        return this.customMessage ? withCustomError(validity) : validity;
    }

    get validationMessage(): string {
        if (this.customMessage) {
            return this.customMessage;
        }
        const input = this.elements.input;
        return input && !input.validity.valid ? standardValidationMessage(input) : "";
    }

    private get customMessage(): string {
        return this.host.getAttribute("error")?.trim() ?? "";
    }

    private readonly onInvalid = (event: Event): void => {
        if (event.target === this.host) {
            this.showNativeMessage = true;
            this.sync();
        }
    };
}

function validState(): ValidityState {
    return {
        badInput: false,
        customError: false,
        patternMismatch: false,
        rangeOverflow: false,
        rangeUnderflow: false,
        stepMismatch: false,
        tooLong: false,
        tooShort: false,
        typeMismatch: false,
        valid: true,
        valueMissing: false,
    };
}

function withCustomError(validity: ValidityState): ValidityState {
    return {
        badInput: validity.badInput,
        customError: true,
        patternMismatch: validity.patternMismatch,
        rangeOverflow: validity.rangeOverflow,
        rangeUnderflow: validity.rangeUnderflow,
        stepMismatch: validity.stepMismatch,
        tooLong: validity.tooLong,
        tooShort: validity.tooShort,
        typeMismatch: validity.typeMismatch,
        valid: false,
        valueMissing: validity.valueMissing,
    };
}

function standardValidationMessage(input: HTMLInputElement): string {
    const validity = input.validity;
    if (validity.valueMissing) {
        return "This field is required.";
    }
    if (validity.typeMismatch) {
        if (input.type === "email") {
            return "Enter a valid email address.";
        }
        if (input.type === "url") {
            return "Enter a valid URL.";
        }
        return "Enter a valid value.";
    }
    if (validity.tooLong) {
        return `Use at most ${input.maxLength} characters.`;
    }
    if (validity.tooShort) {
        return `Use at least ${input.minLength} characters.`;
    }
    if (validity.patternMismatch) {
        return "Use the expected format.";
    }
    if (validity.rangeUnderflow) {
        return `Enter a value greater than or equal to ${input.min}.`;
    }
    if (validity.rangeOverflow) {
        return `Enter a value less than or equal to ${input.max}.`;
    }
    if (validity.stepMismatch) {
        return "Enter a valid increment.";
    }
    if (validity.badInput) {
        return "Enter a valid value.";
    }
    return "Enter a valid value.";
}
