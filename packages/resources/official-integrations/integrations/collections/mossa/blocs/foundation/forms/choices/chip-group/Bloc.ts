import { mossaColorSchemeCss } from "./colorSchemes";

class MossaChipGroup extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
        "accessible-label",
        "disabled",
        "label",
        "mode",
        "name",
        "required",
        "unchecked-value",
        "value",
    ];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internals = this.attachInternals();
        this.defaultValues = [];
        this.showValidation = false;
        this.root.innerHTML = `
            <style>
                ${mossaColorSchemeCss()}

                :host {
                    --_mossa-chip-background: var(--ulvia-surface-background);
                    --_mossa-chip-border-color: var(--ulvia-surface-border);
                    --_mossa-chip-color: var(--ulvia-surface-text);
                    --_mossa-chip-selected-background: var(--_mossa-tone-base);
                    --_mossa-chip-selected-border: var(--_mossa-tone-border);
                    --_mossa-chip-selected-color: var(--_mossa-tone-foreground);
                    --_mossa-focus-color: var(--_mossa-tone-focus);
                    display: grid;
                    gap: var(--_mossa-field-gap, var(--ulvia-space-sm));
                    color: inherit;
                    font: inherit;
                }

                :host([appearance="soft"]) {
                    --_mossa-chip-selected-background: var(--_mossa-tone-muted);
                    --_mossa-chip-selected-border: var(--_mossa-tone-muted);
                    --_mossa-chip-selected-color: var(--_mossa-tone-contrasted);
                }

                :host([appearance="outlined"]) {
                    --_mossa-chip-selected-background: transparent;
                    --_mossa-chip-selected-border: var(--_mossa-tone-border);
                    --_mossa-chip-selected-color: var(--_mossa-tone-contrasted);
                }

                .label {
                    font-weight: var(--_mossa-label-weight, 650);
                }

                .choices {
                    display: flex;
                    flex-wrap: wrap;
                    gap: var(--_mossa-chip-group-gap, var(--ulvia-space-sm));
                }

                :host([disabled]) .choices { opacity: .6; }
                .error { color: var(--_mossa-error-color, var(--ulvia-danger-base)); }
                [hidden] { display: none; }
            </style>
            <span class="label" part="label"></span>
            <div class="choices" part="choices" role="group" tabindex="-1" aria-describedby="error"><slot></slot></div>
            <small id="error" class="error" part="error" aria-live="polite"></small>
        `;
        this.labelElement = this.root.querySelector(".label");
        this.choicesElement = this.root.querySelector(".choices");
        this.errorElement = this.root.querySelector(".error");
        this.slotElement = this.root.querySelector("slot");
        this.observer = new MutationObserver(this.sync);
    }

    connectedCallback() {
        this.upgradeProperty("value");
        this.defaultValues = this.initialValues();
        this.applyValues(this.defaultValues);
        this.addEventListener("mossa-chip:toggle", this.onToggle);
        this.addEventListener("invalid", this.onInvalid);
        this.slotElement.addEventListener("slotchange", this.sync);
        this.observer.observe(this, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["disabled", "selected", "value"],
        });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("mossa-chip:toggle", this.onToggle);
        this.removeEventListener("invalid", this.onInvalid);
        this.slotElement.removeEventListener("slotchange", this.sync);
        this.observer.disconnect();
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) {
            return;
        }
        if (name === "value") {
            this.applyValues(this.normalizeValues(this.getAttribute("value")));
        } else if (name === "mode" && !this.multiple) {
            this.applyValues(this.selectedValues().slice(0, 1));
        }
        this.sync();
    }

    formResetCallback() {
        this.showValidation = false;
        this.setValues(this.defaultValues, false);
    }

    formDisabledCallback(disabled) {
        this.disabled = disabled;
    }

    get value() {
        const values = this.selectedValues();
        return this.multiple ? values : values[0] || "";
    }

    set value(value) {
        this.setValues(this.normalizeValues(value), false);
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

    get multiple() {
        return this.getAttribute("mode") === "multiple";
    }

    sync = () => {
        this.labelElement.textContent = this.getAttribute("label") || "";
        this.labelElement.hidden = !this.labelElement.textContent;
        const accessibleLabel = this.getAttribute("accessible-label") || "";
        const groupLabel = this.labelElement.textContent || accessibleLabel;
        if (groupLabel) {
            this.choicesElement.setAttribute("aria-label", groupLabel);
        } else {
            this.choicesElement.removeAttribute("aria-label");
        }

        this.syncDisabled();
        this.updateFormValue();
    };

    initialValues() {
        const explicitValue = this.getAttribute("value");
        if (explicitValue !== null) {
            return this.normalizeValues(explicitValue);
        }
        return this.chips()
            .filter((chip) => chip.hasAttribute("selected"))
            .map((chip) => chip.value);
    }

    normalizeValues(value) {
        if (Array.isArray(value)) {
            return value.map(String).filter(Boolean);
        }
        const raw = String(value ?? "").trim();
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map(String).filter(Boolean);
            }
        } catch {
            // Comma-separated values are convenient in authored HTML.
        }
        return raw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    chips() {
        return Array.from(this.querySelectorAll(":scope > mossa-chip"));
    }

    selectedValues() {
        return this.chips()
            .filter((chip) => chip.selected)
            .map((chip) => chip.value)
            .filter(Boolean);
    }

    applyValues(values) {
        const selected = new Set(this.multiple ? values : values.slice(0, 1));
        for (const chip of this.chips()) {
            chip.selected = selected.has(chip.value);
        }
    }

    setValues(values, emit) {
        this.applyValues(values);
        this.updateFormValue();
        if (emit) {
            this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        }
    }

    upgradeProperty(name) {
        if (!Object.prototype.hasOwnProperty.call(this, name)) {
            return;
        }
        const value = this[name];
        delete this[name];
        this[name] = value;
    }

    syncDisabled() {
        for (const chip of this.chips()) {
            if (this.disabled) {
                if (!chip.disabled) {
                    chip.setAttribute("data-disabled-by-group", "");
                }
                chip.disabled = true;
            } else if (chip.hasAttribute("data-disabled-by-group")) {
                chip.removeAttribute("data-disabled-by-group");
                chip.disabled = false;
            }
        }
    }

    updateFormValue() {
        const values = this.selectedValues();
        if (this.disabled || !this.name) {
            this.internals.setFormValue(null);
        } else if (values.length === 0) {
            this.internals.setFormValue(this.getAttribute("unchecked-value"));
        } else if (this.multiple) {
            const data = new FormData();
            for (const value of values) {
                data.append(this.name, value);
            }
            this.internals.setFormValue(data);
        } else {
            this.internals.setFormValue(values[0]);
        }

        let validationMessage = "";
        if (this.disabled) {
            this.internals.setValidity({});
        } else if (this.hasAttribute("required") && values.length === 0) {
            validationMessage = "Select at least one option.";
            this.internals.setValidity({ valueMissing: true }, validationMessage, this.choicesElement);
        } else {
            this.internals.setValidity({});
        }
        this.choicesElement.setAttribute("aria-invalid", String(Boolean(validationMessage)));
        this.errorElement.textContent = this.showValidation ? validationMessage : "";
        this.errorElement.hidden = !this.errorElement.textContent;
    }

    onToggle = (event) => {
        if (this.disabled) {
            return;
        }
        const chip = event.composedPath().find((node) => node instanceof HTMLElement && node.tagName === "MOSSA-CHIP");
        if (!chip || chip.parentElement !== this || chip.disabled) {
            return;
        }
        if (this.multiple) {
            chip.selected = !chip.selected;
        } else if (!chip.selected) {
            this.applyValues([chip.value]);
        }
        this.updateFormValue();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };

    onInvalid = () => {
        this.showValidation = true;
        this.updateFormValue();
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaChipGroup);
