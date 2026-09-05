import { mossaColorSchemeCss } from "./colorSchemes";

class MossaTextarea extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
        "disabled",
        "hint",
        "label",
        "maxlength",
        "minlength",
        "name",
        "placeholder",
        "readonly",
        "required",
        "rows",
        "value",
    ];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internals = this.attachInternals();
        this.defaultValue = "";
        this.showValidation = false;
        this.root.innerHTML = `
            <style>
                ${mossaColorSchemeCss()}

                :host {
                    --_mossa-field-background: var(--ulvia-surface-background);
                    --_mossa-field-border: var(--ulvia-surface-border);
                    --_mossa-field-color: var(--ulvia-surface-text);
                    display: block;
                    color: inherit;
                    font: inherit;
                }

                :host([appearance="soft"]) {
                    --_mossa-field-background: var(--_mossa-tone-muted);
                    --_mossa-field-border: var(--_mossa-tone-muted);
                    --_mossa-field-color: var(--_mossa-tone-contrasted);
                }

                :host([appearance="filled"]) {
                    --_mossa-field-background: var(--_mossa-tone-base);
                    --_mossa-field-border: var(--_mossa-tone-base);
                    --_mossa-field-color: var(--_mossa-tone-foreground);
                }

                :host([appearance="outlined"]) {
                    --_mossa-field-border: var(--_mossa-tone-border);
                    --_mossa-field-color: var(--_mossa-tone-contrasted);
                }

                :host([appearance="ghost"]) {
                    --_mossa-field-background: transparent;
                    --_mossa-field-border: transparent;
                    --_mossa-field-color: var(--_mossa-tone-contrasted);
                }

                .field {
                    display: grid;
                    gap: var(--_mossa-field-gap, var(--ulvia-space-sm));
                }

                label {
                    font-weight: var(--_mossa-label-weight, 650);
                }

                textarea {
                    box-sizing: border-box;
                    width: 100%;
                    padding: var(--_mossa-input-padding, var(--ulvia-space-sm) calc(var(--ulvia-space-sm) + var(--ulvia-space-xs)));
                    border: var(--_mossa-input-border, 1px solid var(--_mossa-input-border-color, var(--_mossa-field-border)));
                    border-radius: var(--_mossa-input-radius, var(--ulvia-radius-card));
                    background: var(--_mossa-input-background, var(--_mossa-field-background));
                    color: var(--_mossa-input-color, var(--_mossa-field-color));
                    font: inherit;
                    resize: vertical;
                }

                textarea:focus-visible {
                    outline: 2px solid var(--_mossa-focus-color, var(--_mossa-tone-focus));
                    outline-offset: 2px;
                }

                :host([disabled]) { opacity: .6; }
                .hint { color: var(--_mossa-muted-color, var(--ulvia-surface-muted-text)); }
                .error { color: var(--_mossa-error-color, var(--ulvia-danger-base)); }
                [hidden] { display: none; }
            </style>
            <div class="field" part="field">
                <label part="label" for="control"></label>
                <textarea id="control" part="textarea"></textarea>
                <small class="hint" part="hint"></small>
                <small class="error" part="error" aria-live="polite"></small>
            </div>
        `;
        this.control = this.root.querySelector("textarea");
        this.labelElement = this.root.querySelector("label");
        this.hintElement = this.root.querySelector(".hint");
        this.errorElement = this.root.querySelector(".error");
    }

    connectedCallback() {
        this.defaultValue = this.getAttribute("value") || "";
        this.control.addEventListener("input", this.onInput);
        this.control.addEventListener("change", this.onChange);
        this.addEventListener("invalid", this.onInvalid);
        this.sync();
    }
    disconnectedCallback() {
        this.control.removeEventListener("input", this.onInput);
        this.control.removeEventListener("change", this.onChange);
        this.removeEventListener("invalid", this.onInvalid);
    }
    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }
    formResetCallback() {
        this.showValidation = false;
        this.value = this.defaultValue;
    }
    formDisabledCallback(disabled) {
        this.disabled = disabled;
    }
    get value() {
        return this.control.value;
    }
    set value(value) {
        this.control.value = value == null ? "" : String(value);
        this.updateFormValue();
    }
    get name() {
        return this.getAttribute("name") || "";
    }
    get disabled() {
        return this.hasAttribute("disabled");
    }
    set disabled(value) {
        this.toggleAttribute("disabled", Boolean(value));
    }
    focus(options) {
        this.control.focus(options);
    }

    sync() {
        this.labelElement.textContent = this.getAttribute("label") || "";
        this.labelElement.hidden = !this.labelElement.textContent;
        this.hintElement.textContent = this.getAttribute("hint") || "";
        this.hintElement.hidden = !this.hintElement.textContent;
        for (const name of ["maxlength", "minlength", "placeholder", "rows"]) {
            const value = this.getAttribute(name);
            value === null ? this.control.removeAttribute(name) : this.control.setAttribute(name, value);
        }
        for (const name of ["disabled", "readonly", "required"]) {
            this.control.toggleAttribute(name, this.hasAttribute(name));
        }
        const value = this.getAttribute("value");
        if (value !== null && value !== this.control.value) {
            this.control.value = value;
        }
        this.updateFormValue();
    }
    updateFormValue() {
        this.internals.setFormValue(this.disabled ? null : this.control.value);
        if (this.disabled || this.control.validity.valid) {
            this.internals.setValidity({});
        } else {
            this.internals.setValidity(this.control.validity, this.control.validationMessage, this.control);
        }
        this.errorElement.textContent = this.showValidation ? this.control.validationMessage || "" : "";
        this.errorElement.hidden = !this.errorElement.textContent;
    }
    onInput = () => {
        this.updateFormValue();
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    };
    onChange = () => {
        this.updateFormValue();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };
    onInvalid = () => {
        this.showValidation = true;
        this.updateFormValue();
    };
}
customElements.define("BE5_TAG_TO_BE_REPLACED", MossaTextarea);
