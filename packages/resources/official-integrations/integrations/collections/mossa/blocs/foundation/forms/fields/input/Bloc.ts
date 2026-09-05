import { mossaColorSchemeCss } from "./colorSchemes";

class MossaInput extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
        "autocomplete",
        "date-format",
        "disabled",
        "hint",
        "invalid-date-message",
        "label",
        "max",
        "maxlength",
        "min",
        "minlength",
        "name",
        "pattern",
        "placeholder",
        "readonly",
        "required",
        "step",
        "type",
        "value",
    ];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internals = this.attachInternals();
        this.defaultValue = "";
        this.defaultsCaptured = false;
        this.showValidation = false;
        this.dayFirstDate = false;
        // Grid stretch sizes the outer box. Percentage sizing overflows padded native
        // date/time controls on iOS Safari (WebKit bug 301648).
        this.root.innerHTML = `
            <style>
                ${mossaColorSchemeCss()}
                :host {
                    --_mossa-field-background: var(--ulvia-surface-background);
                    --_mossa-field-border: var(--ulvia-surface-border);
                    --_mossa-field-color: var(--ulvia-surface-text);
                    display: block;
                    box-sizing: border-box;
                    min-width: 0;
                    min-inline-size: 0;
                    max-width: 100%;
                    max-inline-size: 100%;
                    font: inherit;
                    color: inherit;
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
                :host([hidden]) { display: none !important; }
                .field { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; min-inline-size: 0; gap: var(--_mossa-field-gap, var(--ulvia-space-sm)); }
                label { font: inherit; font-weight: var(--_mossa-label-weight, 650); }
                input { box-sizing: border-box; width: auto; inline-size: auto; min-width: 0; min-inline-size: 0; max-width: 100%; max-inline-size: 100%; justify-self: stretch; min-height: var(--_mossa-input-height, 2.75rem); padding: var(--_mossa-input-padding, var(--ulvia-space-sm) calc(var(--ulvia-space-sm) + var(--ulvia-space-xs))); border: var(--_mossa-input-border, 1px solid var(--_mossa-input-border-color, var(--_mossa-field-border))); border-radius: var(--_mossa-input-radius, var(--ulvia-radius-card)); background: var(--_mossa-input-background, var(--_mossa-field-background)); color: var(--_mossa-input-color, var(--_mossa-field-color)); font: inherit; }
                input:focus-visible { outline: 2px solid var(--_mossa-focus-color, var(--_mossa-tone-focus)); outline-offset: 2px; }
                :host([disabled]) { opacity: .6; }
                .hint { color: var(--_mossa-muted-color, var(--ulvia-surface-muted-text)); }
                .error { color: var(--_mossa-error-color, var(--ulvia-danger-base)); }
                [hidden] { display: none; }
            </style>
            <div class="field" part="field">
                <label part="label" for="control"></label>
                <input id="control" part="input">
                <small class="hint" part="hint"></small>
                <small class="error" part="error" aria-live="polite"></small>
            </div>`;
        this.input = this.root.querySelector("input");
        this.labelElement = this.root.querySelector("label");
        this.hintElement = this.root.querySelector(".hint");
        this.errorElement = this.root.querySelector(".error");
    }

    connectedCallback() {
        if (!this.defaultsCaptured) {
            this.defaultValue = this.getAttribute("value") || "";
            this.defaultsCaptured = true;
        }
        this.input.addEventListener("input", this.onInput);
        this.input.addEventListener("change", this.onChange);
        this.input.addEventListener("keydown", this.onKeydown);
        this.addEventListener("invalid", this.onInvalid);
        this.sync();
    }

    disconnectedCallback() {
        this.input.removeEventListener("input", this.onInput);
        this.input.removeEventListener("change", this.onChange);
        this.input.removeEventListener("keydown", this.onKeydown);
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
        return this.serializeValue();
    }
    set value(value) {
        this.input.value = this.dayFirstDate ? formatDayFirstDate(value) : value == null ? "" : String(value);
        this.internals.setFormValue(this.disabled ? null : this.serializeValue());
        this.syncValidity();
    }
    get name() {
        return this.getAttribute("name") || "";
    }
    set name(value) {
        value ? this.setAttribute("name", value) : this.removeAttribute("name");
    }
    get disabled() {
        return this.hasAttribute("disabled");
    }
    set disabled(value) {
        this.toggleAttribute("disabled", Boolean(value));
    }
    get required() {
        return this.hasAttribute("required");
    }
    set required(value) {
        this.toggleAttribute("required", Boolean(value));
    }
    focus(options) {
        this.input.focus(options);
    }

    sync() {
        this.labelElement.textContent = this.getAttribute("label") || "";
        this.labelElement.hidden = !this.labelElement.textContent;
        this.hintElement.textContent = this.getAttribute("hint") || "";
        this.hintElement.hidden = !this.hintElement.textContent;
        const type = this.getAttribute("type") || "text";
        const wasDayFirstDate = this.dayFirstDate;
        this.dayFirstDate = type === "date" && this.getAttribute("date-format") === "day-month-year";
        this.input.type = this.dayFirstDate ? "text" : type === "datetime" ? "datetime-local" : type;
        if (this.dayFirstDate) {
            this.input.inputMode = "numeric";
        } else {
            this.input.removeAttribute("inputmode");
        }
        for (const name of ["autocomplete", "max", "maxlength", "min", "minlength", "pattern", "placeholder", "step"]) {
            const value = this.getAttribute(name);
            if (value === null) {
                this.input.removeAttribute(name);
            } else {
                this.input.setAttribute(name, value);
            }
        }
        for (const name of ["disabled", "readonly", "required"]) {
            this.input.toggleAttribute(name, this.hasAttribute(name));
        }
        const value = this.getAttribute("value");
        if (value !== null && (wasDayFirstDate !== this.dayFirstDate || value !== this.value)) {
            this.input.value = this.dayFirstDate ? formatDayFirstDate(value) : value;
        }
        this.internals.setFormValue(this.disabled ? null : this.serializeValue());
        this.syncValidity();
    }

    syncValidity() {
        const serializedDate = this.dayFirstDate && this.input.value ? parseDayFirstDate(this.input.value) : null;
        const invalidFormattedDate = this.dayFirstDate && Boolean(this.input.value) && !serializedDate;
        const belowMinimum =
            serializedDate && this.getAttribute("min") ? serializedDate < this.getAttribute("min") : false;
        const aboveMaximum =
            serializedDate && this.getAttribute("max") ? serializedDate > this.getAttribute("max") : false;

        const dateValidationMessage =
            invalidFormattedDate || belowMinimum || aboveMaximum
                ? this.getAttribute("invalid-date-message") || "Enter a valid date in DD/MM/YYYY format."
                : "";

        if (this.disabled || (this.input.validity.valid && !dateValidationMessage)) {
            this.internals.setValidity({});
        } else if (dateValidationMessage) {
            this.internals.setValidity({ customError: true }, dateValidationMessage, this.input);
        } else {
            this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input);
        }
        this.errorElement.textContent = this.showValidation
            ? dateValidationMessage || this.input.validationMessage || ""
            : "";
        this.errorElement.hidden = !this.errorElement.textContent;
    }

    onInput = () => {
        this.internals.setFormValue(this.disabled ? null : this.serializeValue());
        this.syncValidity();
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    };
    onChange = () => {
        this.internals.setFormValue(this.disabled ? null : this.serializeValue());
        this.syncValidity();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };
    onInvalid = () => {
        this.showValidation = true;
        this.syncValidity();
    };
    onKeydown = (event) => {
        if (
            event.key !== "Enter" ||
            event.isComposing ||
            event.defaultPrevented ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            this.disabled ||
            this.hasAttribute("readonly")
        ) {
            return;
        }

        const form = this.internals.form || this.closest("form");
        if (!form) {
            return;
        }
        event.preventDefault();
        form.requestSubmit();
    };

    serializeValue() {
        if (!this.dayFirstDate || !this.input.value) {
            return this.input.value;
        }
        return parseDayFirstDate(this.input.value) || this.input.value;
    }
}

function formatDayFirstDate(value) {
    const normalized = value == null ? "" : String(value).trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : normalized;
}

function parseDayFirstDate(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value).trim());
    if (!match) {
        return null;
    }
    const isoDate = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${isoDate}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate ? null : isoDate;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaInput);
