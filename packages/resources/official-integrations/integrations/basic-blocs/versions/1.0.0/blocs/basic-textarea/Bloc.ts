class BasicTextarea extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
        "accent-color",
        "background-color",
        "border-color",
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
        "text-color",
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
                :host {
                    display: block;
                    color: inherit;
                    font: inherit;
                }

                .field {
                    display: grid;
                    gap: var(--cms-field-gap, .375rem);
                }

                label {
                    font-weight: var(--cms-label-weight, 650);
                }

                textarea {
                    box-sizing: border-box;
                    width: 100%;
                    padding: var(--cms-input-padding, .65rem .75rem);
                    border: var(--cms-input-border, 1px solid var(--cms-input-border-color, color-mix(in srgb, currentColor 25%, transparent)));
                    border-radius: var(--cms-input-radius, .5rem);
                    background: var(--cms-input-background, Canvas);
                    color: var(--cms-input-color, inherit);
                    font: inherit;
                    resize: vertical;
                }

                textarea:focus-visible {
                    outline: 2px solid var(--cms-focus-color, var(--primary-base, currentColor));
                    outline-offset: 2px;
                }

                :host([disabled]) { opacity: .6; }
                .hint { color: var(--cms-muted-color, color-mix(in srgb, currentColor 65%, transparent)); }
                .error { color: var(--cms-error-color, #b42318); }
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
        this.fieldElement = this.root.querySelector(".field");
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
        if (this.isConnected) this.sync();
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
        this.syncColors();
        this.labelElement.textContent = this.getAttribute("label") || "";
        this.labelElement.hidden = !this.labelElement.textContent;
        this.hintElement.textContent = this.getAttribute("hint") || "";
        this.hintElement.hidden = !this.hintElement.textContent;
        for (const name of ["maxlength", "minlength", "placeholder", "rows"]) {
            const value = this.getAttribute(name);
            value === null
                ? this.control.removeAttribute(name)
                : this.control.setAttribute(name, value);
        }
        for (const name of ["disabled", "readonly", "required"])
            this.control.toggleAttribute(name, this.hasAttribute(name));
        const value = this.getAttribute("value");
        if (value !== null && value !== this.control.value)
            this.control.value = value;
        this.updateFormValue();
    }
    syncColors() {
        for (const [attribute, property] of [
            ["accent-color", "--cms-focus-color"],
            ["background-color", "--cms-input-background"],
            ["border-color", "--cms-input-border-color"],
            ["text-color", "--cms-input-color"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) this.fieldElement.style.setProperty(property, value);
            else this.fieldElement.style.removeProperty(property);
        }
    }
    updateFormValue() {
        this.internals.setFormValue(this.disabled ? null : this.control.value);
        if (this.disabled || this.control.validity.valid)
            this.internals.setValidity({});
        else
            this.internals.setValidity(
                this.control.validity,
                this.control.validationMessage,
                this.control,
            );
        this.errorElement.textContent = this.showValidation
            ? this.control.validationMessage || ""
            : "";
        this.errorElement.hidden = !this.errorElement.textContent;
    }
    onInput = () => {
        this.updateFormValue();
        this.dispatchEvent(
            new Event("input", { bubbles: true, composed: true }),
        );
    };
    onChange = () => {
        this.updateFormValue();
        this.dispatchEvent(
            new Event("change", { bubbles: true, composed: true }),
        );
    };
    onInvalid = () => {
        this.showValidation = true;
        this.updateFormValue();
    };
}
customElements.define("BE5_TAG_TO_BE_REPLACED", BasicTextarea);
