import { basicColorSchemeCss } from "./colorSchemes";

class BasicCheckbox extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
        "accessible-label",
        "accent-color",
        "background-color",
        "border-color",
        "checked",
        "checked-state",
        "check-color",
        "disabled",
        "name",
        "presentation",
        "required",
        "text-color",
        "unchecked-value",
        "value",
    ];
    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internals = this.attachInternals();
        this.defaultChecked = false;
        this.showValidation = false;
        this.root.innerHTML = `
            <style>
                ${basicColorSchemeCss()}

                :host {
                    --_checkbox-background: var(--ulvia-field-background, Canvas);
                    --_checkbox-border: var(--ulvia-field-border, color-mix(in srgb, currentColor 30%, transparent));
                    --_checkbox-checked-background: var(--_tone-base);
                    --_checkbox-checked-border: var(--_tone-border);
                    --_checkbox-check-color: var(--_tone-foreground);
                    display: inline-block;
                    color: var(--cms-input-color, var(--ulvia-field-text, inherit));
                    font: inherit;
                }

                :host([appearance="soft"]) {
                    --_checkbox-checked-background: var(--_tone-muted);
                    --_checkbox-checked-border: var(--_tone-muted);
                    --_checkbox-check-color: var(--_tone-contrasted);
                }

                :host([appearance="outlined"]) {
                    --_checkbox-checked-background: transparent;
                    --_checkbox-checked-border: var(--_tone-border);
                    --_checkbox-check-color: var(--_tone-contrasted);
                }

                label {
                    display: inline-flex;
                    align-items: flex-start;
                    gap: .5rem;
                    cursor: pointer;
                }

                :host([disabled]) { opacity: .6; }

                input {
                    appearance: none;
                    display: inline-grid;
                    width: 1.125rem;
                    height: 1.125rem;
                    flex: 0 0 auto;
                    place-content: center;
                    margin: .15rem 0 0;
                    border: 1px solid var(--cms-checkbox-border, var(--_checkbox-border));
                    border-radius: .25rem;
                    background: var(--cms-checkbox-background, var(--_checkbox-background));
                    color: var(--cms-checkbox-check-color, var(--_checkbox-check-color));
                    cursor: pointer;
                    transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
                }

                input::after {
                    width: .55rem;
                    height: .3rem;
                    border-bottom: 2px solid currentColor;
                    border-left: 2px solid currentColor;
                    content: "";
                    opacity: 0;
                    transform: translateY(-.06rem) rotate(-45deg) scale(.7);
                    transition: opacity 100ms ease, transform 100ms ease;
                }

                input:checked {
                    border-color: var(--cms-accent-color, var(--_checkbox-checked-border));
                    background: var(--cms-accent-color, var(--_checkbox-checked-background));
                }

                input:checked::after {
                    opacity: 1;
                    transform: translateY(-.06rem) rotate(-45deg) scale(1);
                }

                input:focus-visible {
                    outline: 2px solid var(--cms-focus-color, var(--_tone-focus));
                    outline-offset: 2px;
                }

                :host([presentation="switch"]) input {
                    position: relative;
                    display: block;
                    width: 2.5rem;
                    height: 1.4rem;
                    margin-top: 0;
                    border-radius: 999px;
                }

                :host([presentation="switch"]) input::after {
                    position: absolute;
                    top: .2rem;
                    left: .2rem;
                    width: .9rem;
                    height: .9rem;
                    border: 0;
                    border-radius: 50%;
                    background: var(--cms-checkbox-check-color, var(--_checkbox-check-color));
                    opacity: 1;
                    transform: none;
                    transition: transform 120ms ease;
                }

                :host([presentation="switch"]) input:checked::after {
                    transform: translateX(1.1rem);
                }

                .error {
                    display: block;
                    color: var(--cms-error-color, var(--ulvia-error-text, #b42318));
                }

                [hidden] { display: none; }
            </style>
            <label part="label">
                <input part="input" type="checkbox">
                <span part="text"><slot></slot></span>
            </label>
            <small class="error" part="error" aria-live="polite"></small>
        `;
        this.labelElement = this.root.querySelector("label");
        this.control = this.root.querySelector("input");
        this.errorElement = this.root.querySelector(".error");
    }
    connectedCallback() {
        this.upgradeProperty("checked");
        this.defaultChecked = this.checked;
        this.control.addEventListener("change", this.onChange);
        this.addEventListener("invalid", this.onInvalid);
        this.sync();
    }
    disconnectedCallback() {
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
        this.checked = this.defaultChecked;
    }
    formDisabledCallback(disabled) {
        this.disabled = disabled;
    }
    get checked() {
        const state = this.getAttribute("checked-state");
        if (state !== null) {
            return ["true", "1", "yes", "on"].includes(state.trim().toLowerCase());
        }
        const value = this.getAttribute("checked");
        return value !== null && !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
    }
    set checked(value) {
        if (this.hasAttribute("checked-state")) {
            this.setAttribute("checked-state", String(Boolean(value)));
        } else {
            this.toggleAttribute("checked", Boolean(value));
        }
    }
    get value() {
        return this.getAttribute("value") || "on";
    }
    set value(value) {
        this.setAttribute("value", String(value));
    }
    get uncheckedValue() {
        return this.getAttribute("unchecked-value");
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
        this.control.checked = this.checked;
        this.control.disabled = this.disabled;
        this.control.required = this.hasAttribute("required");
        this.control.value = this.value;
        const accessibleLabel = this.getAttribute("accessible-label") || "";
        if (accessibleLabel) {
            this.control.setAttribute("aria-label", accessibleLabel);
        } else {
            this.control.removeAttribute("aria-label");
        }
        if (this.getAttribute("presentation") === "switch") {
            this.control.setAttribute("role", "switch");
        } else {
            this.control.removeAttribute("role");
        }
        this.updateFormValue();
    }
    syncColors() {
        for (const [attribute, property] of [
            ["accent-color", "--cms-accent-color"],
            ["background-color", "--cms-checkbox-background"],
            ["border-color", "--cms-checkbox-border"],
            ["check-color", "--cms-checkbox-check-color"],
            ["text-color", "--cms-input-color"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.style.setProperty(property, value);
            } else {
                this.style.removeProperty(property);
            }
        }
    }
    updateFormValue() {
        if (this.disabled) {
            this.internals.setFormValue(null);
            this.internals.setValidity({});
            this.errorElement.textContent = "";
            this.errorElement.hidden = true;
            return;
        }
        this.internals.setFormValue(this.checked ? this.value : this.uncheckedValue);
        if (this.control.validity.valid) {
            this.internals.setValidity({});
        } else {
            this.internals.setValidity(this.control.validity, this.control.validationMessage, this.control);
        }
        this.errorElement.textContent = this.showValidation ? this.control.validationMessage || "" : "";
        this.errorElement.hidden = !this.errorElement.textContent;
    }
    upgradeProperty(name) {
        if (!Object.prototype.hasOwnProperty.call(this, name)) {
            return;
        }
        const value = this[name];
        delete this[name];
        this[name] = value;
    }
    onChange = () => {
        this.checked = this.control.checked;
        this.updateFormValue();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };
    onInvalid = () => {
        this.showValidation = true;
        this.updateFormValue();
    };
}
customElements.define("BE5_TAG_TO_BE_REPLACED", BasicCheckbox);
