import { ValidatableFormControlElement } from "../../Structure/ValidatableFormControlElement";
import template from "./ui/template.html" with { type: "text" };
import baseCss from "./ui/styles/base.css" with { type: "text" };
import helpCss from "./ui/styles/help.css" with { type: "text" };
import variantCss from "./ui/styles/variant.css" with { type: "text" };
import responsiveCss from "./ui/styles/responsive.css" with { type: "text" };
import { upgradeProperty, updateCounter } from "./compute";
import { InputHelpController } from "./feedback";
import { handleInput, handleChange, handleEnterSubmit } from "./listener";
import { P9R_INPUT_ATTRIBUTES, syncAll } from "./sync";
import { InputValidityController } from "./validity";

const css = baseCss + helpCss + variantCss + responsiveCss;

export class P9rInput extends ValidatableFormControlElement {
    static readonly observedAttributes = P9R_INPUT_ATTRIBUTES;

    private readonly input: HTMLInputElement | null;
    private readonly label: HTMLLabelElement | null;
    private readonly counter: HTMLElement | null;
    private readonly count: HTMLElement | null;
    private readonly max: HTMLElement | null;
    private readonly helpController: InputHelpController;
    private readonly validityController: InputValidityController;
    private defaultValue = "";
    private defaultsCaptured = false;

    constructor() {
        super({ css, template: template as unknown as string });
        const root = this.shadowRoot!;
        this.input = root.querySelector(".input");
        this.label = root.querySelector(".label");
        this.counter = root.querySelector(".counter");
        this.count = root.querySelector(".count");
        this.max = root.querySelector(".max");
        this.helpController = new InputHelpController(this, {
            row: root.querySelector(".label-row"),
            button: root.querySelector(".help-button"),
            popover: root.querySelector(".help-popover"),
            slot: root.querySelector(".help-slot"),
            text: root.querySelector(".help-text"),
        });
        this.validityController = new InputValidityController(this, this._internals, {
            input: this.input,
            hint: root.querySelector(".hint"),
            error: root.querySelector(".error"),
            meta: root.querySelector(".meta"),
            counter: this.counter,
        });
    }

    override connectedCallback(): void {
        if (!this.defaultsCaptured) {
            this.defaultValue = this.getAttribute("value") ?? "";
            this.defaultsCaptured = true;
        }
        ["value", "disabled", "required"].forEach((property) => upgradeProperty(this, property));
        this.input?.addEventListener("input", this.onInput);
        this.input?.addEventListener("change", this.onChange);
        this.input?.addEventListener("keydown", this.onKeyDown);
        syncAll(this, this.input, this.label, this.counter, this.max);
        this.helpController.connect();
        this.validityController.connect();
        const initial = this.getAttribute("value");
        if (initial !== null) {
            this.value = initial;
        } else {
            updateCounter(this, this.input, this.counter, this.count);
        }
    }

    disconnectedCallback(): void {
        this.input?.removeEventListener("input", this.onInput);
        this.input?.removeEventListener("change", this.onChange);
        this.input?.removeEventListener("keydown", this.onKeyDown);
        this.helpController.disconnect();
        this.validityController.disconnect();
    }

    formResetCallback(): void {
        this.value = this.defaultValue;
        this.validityController.reset();
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
        if (!this.input) {
            return;
        }
        if (name === "value" && newValue !== null) {
            this.value = newValue;
            return;
        }
        syncAll(this, this.input, this.label, this.counter, this.max);
        if (name === "max-count") {
            updateCounter(this, this.input, this.counter, this.count);
        }
        this.helpController.sync();
        this.validityController.sync();
    }

    get value(): string {
        return this.input?.value ?? "";
    }

    set value(value: string) {
        if (!this.input) {
            return;
        }
        this.input.value = value;
        this._internals.setFormValue(value);
        updateCounter(this, this.input, this.counter, this.count);
        this.validityController.sync();
    }

    get name(): string {
        return this.getAttribute("name") ?? "";
    }

    get disabled(): boolean {
        return this.input?.disabled ?? false;
    }

    set disabled(value: boolean) {
        value ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }

    get required(): boolean {
        return this.hasAttribute("required");
    }

    set required(value: boolean) {
        value ? this.setAttribute("required", "") : this.removeAttribute("required");
    }

    override focus(): void {
        this.input?.focus();
    }

    private readonly onInput = (): void => {
        handleInput(this, this.input, this._internals, this.counter, this.count);
        this.validityController.sync();
    };

    private readonly onChange = (): void => {
        handleChange(this, this.input, this._internals);
        this.validityController.sync();
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        handleEnterSubmit(this, this.input, this._internals, event);
    };

    protected syncValidity(): void {
        this.validityController.sync();
    }

    protected get controlValidity(): ValidityState {
        return this.validityController.validity;
    }

    protected get controlValidationMessage(): string {
        return this.validityController.validationMessage;
    }
}
