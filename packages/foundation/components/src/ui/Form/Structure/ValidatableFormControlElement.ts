import { Component, type ComponentMetadata } from "@bernouy/components/base";

/** Shared browser-facing validity contract for form-associated controls. */
export abstract class ValidatableFormControlElement extends Component {
    static formAssociated = true;
    protected readonly _internals: ElementInternals;

    constructor(metadata: ComponentMetadata) {
        super(metadata);
        this._internals = this.attachInternals();
    }

    get error(): string {
        return this.getAttribute("error") ?? "";
    }

    set error(message: string) {
        this.setCustomValidity(message);
    }

    get form(): HTMLFormElement | null {
        return this._internals.form;
    }

    get validity(): ValidityState {
        return this._internals.validity ?? this.controlValidity;
    }

    get validationMessage(): string {
        return this._internals.validationMessage ?? this.controlValidationMessage;
    }

    get willValidate(): boolean {
        return this._internals.willValidate ?? !this.hasAttribute("disabled");
    }

    setCustomValidity(message: string): void {
        if (message) {
            this.setAttribute("error", message);
        } else {
            this.removeAttribute("error");
        }
        this.syncValidity();
    }

    checkValidity(): boolean {
        if (typeof this._internals.checkValidity === "function") {
            return this._internals.checkValidity();
        }
        return this.checkFallbackValidity();
    }

    reportValidity(): boolean {
        if (typeof this._internals.reportValidity === "function") {
            return this._internals.reportValidity();
        }
        return this.checkFallbackValidity();
    }

    protected abstract syncValidity(): void;
    protected abstract get controlValidity(): ValidityState;
    protected abstract get controlValidationMessage(): string;

    private checkFallbackValidity(): boolean {
        const valid = this.controlValidity.valid;
        if (!valid) {
            this.dispatchEvent(new Event("invalid", { cancelable: true }));
        }
        return valid;
    }
}
