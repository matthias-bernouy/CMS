class BasicSelect extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
        "accessible-label",
        "accent-color",
        "background-color",
        "border-color",
        "disabled",
        "hint",
        "label",
        "multiple",
        "name",
        "placeholder",
        "required",
        "text-color",
        "value",
    ];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internals = this.attachInternals();
        this.defaultValues = [];
        this.defaultsCaptured = false;
        this.requestedValues = undefined;
        this.selectedValuesState = [];
        this.optionModels = [];
        this.activeIndex = -1;
        this.open = false;
        this.showValidation = false;
        this.root.innerHTML = `
            <style>
                :host {
                    position: relative;
                    display: block;
                    box-sizing: border-box;
                    min-width: min(12rem, 100%);
                    max-width: 100%;
                    color: inherit;
                    font: inherit;
                }

                .field {
                    display: grid;
                    gap: var(--cms-field-gap, .375rem);
                }

                .label { font-weight: var(--cms-label-weight, 650); }

                .control {
                    box-sizing: border-box;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: .75rem;
                    width: 100%;
                    min-height: var(--cms-input-height, 2.75rem);
                    padding: var(--cms-input-padding, .65rem .75rem);
                    border: var(--cms-input-border, 1px solid var(--cms-input-border-color, color-mix(in srgb, currentColor 25%, transparent)));
                    border-radius: var(--cms-input-radius, .5rem);
                    background: var(--cms-input-background, Canvas);
                    color: var(--cms-input-color, inherit);
                    font: inherit;
                    text-align: left;
                    cursor: pointer;
                }

                .control:focus-visible {
                    outline: 2px solid var(--cms-focus-color, var(--secondary-base, currentColor));
                    outline-offset: 2px;
                }

                .value {
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .value[data-placeholder="true"] {
                    color: var(--cms-muted-color, color-mix(in srgb, currentColor 65%, transparent));
                }

                .chevron {
                    width: .55rem;
                    height: .55rem;
                    flex: 0 0 auto;
                    border-right: 1.5px solid currentColor;
                    border-bottom: 1.5px solid currentColor;
                    transform: translateY(-.15rem) rotate(45deg);
                    transition: transform 120ms ease;
                }

                :host([data-open]) .chevron {
                    transform: translateY(.15rem) rotate(225deg);
                }

                .listbox {
                    position: absolute;
                    z-index: var(--cms-select-z-index, 1000);
                    inset: calc(100% + .3rem) 0 auto;
                    display: grid;
                    max-height: var(--cms-select-max-height, 17rem);
                    padding: .3rem;
                    overflow-y: auto;
                    border: 1px solid var(--cms-input-border-color, color-mix(in srgb, currentColor 25%, transparent));
                    border-radius: var(--cms-input-radius, .5rem);
                    background: var(--cms-input-background, Canvas);
                    color: var(--cms-input-color, inherit);
                    box-shadow: var(--cms-select-shadow, 0 .75rem 2rem color-mix(in srgb, currentColor 14%, transparent));
                }

                .option {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: .75rem;
                    width: 100%;
                    min-height: 2.5rem;
                    padding: .55rem .65rem;
                    border: 0;
                    border-radius: calc(var(--cms-input-radius, .5rem) - .15rem);
                    background: transparent;
                    color: inherit;
                    font: inherit;
                    text-align: left;
                    cursor: pointer;
                }

                .option:hover:not(:disabled),
                .option:focus-visible {
                    outline: none;
                    background: color-mix(in srgb, var(--cms-focus-color, var(--secondary-base, currentColor)) 12%, transparent);
                }

                .option[aria-selected="true"] {
                    background: color-mix(in srgb, var(--cms-focus-color, var(--secondary-base, currentColor)) 18%, transparent);
                    font-weight: 650;
                }

                .option[aria-selected="true"]::after {
                    content: "✓";
                    color: var(--cms-focus-color, var(--secondary-base, currentColor));
                    font-weight: 800;
                }

                .option:disabled { cursor: not-allowed; opacity: .5; }
                :host([disabled]) { opacity: .6; }
                :host([disabled]) .control { cursor: not-allowed; }
                .hint { color: var(--cms-muted-color, color-mix(in srgb, currentColor 65%, transparent)); }
                .error { color: var(--cms-error-color, #b42318); }
                .source { display: none; }
                [hidden] { display: none; }

                @media (prefers-reduced-motion: reduce) {
                    .chevron { transition: none; }
                }
            </style>
            <div class="field" part="field">
                <span id="field-label" class="label" part="label"></span>
                <button class="control" part="control" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="listbox" aria-describedby="hint error">
                    <span id="control-value" class="value" part="value"></span>
                    <span class="chevron" part="chevron" aria-hidden="true"></span>
                </button>
                <div id="listbox" class="listbox" part="listbox" role="listbox" hidden></div>
                <small id="hint" class="hint" part="hint"></small>
                <small id="error" class="error" part="error" aria-live="polite"></small>
            </div>
            <div class="source" aria-hidden="true"><slot></slot></div>
        `;
        this.fieldElement = this.root.querySelector(".field");
        this.labelElement = this.root.querySelector(".label");
        this.control = this.root.querySelector(".control");
        this.valueElement = this.root.querySelector(".value");
        this.listbox = this.root.querySelector(".listbox");
        this.hintElement = this.root.querySelector(".hint");
        this.errorElement = this.root.querySelector(".error");
        this.slotElement = this.root.querySelector("slot");
        this.observer = new MutationObserver(this.rebuild);
    }

    connectedCallback() {
        this.upgradeProperty("value");
        this.control.addEventListener("click", this.onControlClick);
        this.control.addEventListener("keydown", this.onControlKeydown);
        this.listbox.addEventListener("click", this.onOptionClick);
        this.listbox.addEventListener("keydown", this.onOptionKeydown);
        this.slotElement.addEventListener("slotchange", this.rebuild);
        this.addEventListener("invalid", this.onInvalid);
        document.addEventListener("pointerdown", this.onDocumentPointerDown);
        this.observer.observe(this, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["value", "selected", "disabled"],
        });
        this.sync();
        this.rebuild();
        if (!this.defaultsCaptured) {
            this.defaultValues = [...this.selectedValuesState];
            this.defaultsCaptured = true;
        }
    }

    disconnectedCallback() {
        this.control.removeEventListener("click", this.onControlClick);
        this.control.removeEventListener("keydown", this.onControlKeydown);
        this.listbox.removeEventListener("click", this.onOptionClick);
        this.listbox.removeEventListener("keydown", this.onOptionKeydown);
        this.slotElement.removeEventListener("slotchange", this.rebuild);
        this.removeEventListener("invalid", this.onInvalid);
        document.removeEventListener("pointerdown", this.onDocumentPointerDown);
        this.observer.disconnect();
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) return;
        if (name === "value") {
            this.requestedValues = this.normalizeValues(this.getAttribute("value"));
            this.applyValues(this.requestedValues);
        } else if (name === "multiple") {
            this.requestedValues = this.normalizeValues(this.value);
            this.applyValues(this.requestedValues);
        }
        this.sync();
    }

    formResetCallback() {
        this.showValidation = false;
        this.requestedValues = [...this.defaultValues];
        this.applyValues(this.requestedValues);
        this.closeListbox(false);
    }

    formDisabledCallback(disabled) {
        this.disabled = disabled;
    }

    get value() {
        return this.multiple
            ? [...this.selectedValuesState]
            : (this.selectedValuesState[0] ?? "");
    }

    set value(value) {
        this.requestedValues = this.normalizeValues(value);
        if (this.isConnected) this.applyValues(this.requestedValues);
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
        return this.hasAttribute("multiple");
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
        this.control.disabled = this.disabled;
        if (this.disabled && this.open) this.closeListbox(false);
        this.control.setAttribute("aria-expanded", String(this.open));
        const accessibleLabel = this.getAttribute("accessible-label") || "";
        if (this.labelElement.textContent) {
            this.control.setAttribute("aria-labelledby", "field-label control-value");
            this.control.removeAttribute("aria-label");
            this.listbox.setAttribute("aria-label", this.labelElement.textContent);
        } else if (accessibleLabel) {
            this.control.removeAttribute("aria-labelledby");
            this.control.setAttribute("aria-label", accessibleLabel);
            this.listbox.setAttribute("aria-label", accessibleLabel);
        } else {
            this.control.removeAttribute("aria-labelledby");
            this.control.removeAttribute("aria-label");
            this.listbox.removeAttribute("aria-label");
        }
        this.listbox.setAttribute("aria-multiselectable", String(this.multiple));
        this.renderValue();
        this.renderOptions();
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

    rebuild = () => {
        const previousValues = this.requestedValues ?? [...this.selectedValuesState];
        this.optionModels = Array.from(
            this.querySelectorAll(":scope > basic-option"),
        ).map((source, index) => ({
            source,
            index,
            value: source.getAttribute("value") ?? source.textContent.trim(),
            label: source.textContent.trim(),
            disabled: source.hasAttribute("disabled"),
            selected: source.hasAttribute("selected"),
        }));

        if (!this.defaultsCaptured && this.requestedValues === undefined) {
            const explicitValue = this.getAttribute("value");
            if (explicitValue !== null) this.requestedValues = this.normalizeValues(explicitValue);
            else {
                const authored = this.optionModels.filter(option => option.selected).map(option => option.value);
                this.requestedValues = authored.length
                    ? (this.multiple ? authored : authored.slice(0, 1))
                    : (!this.multiple && this.optionModels.length ? [this.optionModels[0].value] : []);
            }
        }

        this.applyValues(this.requestedValues ?? previousValues);
    };

    normalizeValues(value) {
        if (Array.isArray(value)) {
            const values = value.map(String);
            return this.multiple ? values.filter(Boolean) : values.slice(0, 1);
        }
        const raw = String(value ?? "").trim();
        if (!this.multiple) return [raw];
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch {
            // Comma-separated values are convenient in authored HTML.
        }
        return raw.split(",").map(item => item.trim()).filter(Boolean);
    }

    applyValues(values) {
        const requested = this.multiple ? values : values.slice(0, 1);
        const available = new Set(this.optionModels.map(option => option.value));
        this.selectedValuesState = requested.filter(value => available.has(value));
        this.renderValue();
        this.renderOptions();
        this.updateFormValue();
    }

    renderValue() {
        const selected = new Set(this.selectedValuesState);
        const labels = this.optionModels
            .filter(option => selected.has(option.value))
            .map(option => option.label);
        const placeholder = this.getAttribute("placeholder") || "Select an option";
        this.valueElement.textContent = labels.length ? labels.join(", ") : placeholder;
        this.valueElement.dataset.placeholder = String(labels.length === 0);
    }

    renderOptions() {
        const selected = new Set(this.selectedValuesState);
        this.listbox.replaceChildren(...this.optionModels.map((option, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "option";
            button.dataset.index = String(index);
            button.setAttribute("role", "option");
            button.setAttribute("aria-selected", String(selected.has(option.value)));
            button.disabled = option.disabled || this.disabled;
            button.textContent = option.label;
            return button;
        }));
    }

    updateFormValue() {
        const values = this.selectedValuesState;
        if (this.disabled || !this.name || values.length === 0) {
            this.internals.setFormValue(null);
        } else if (this.multiple) {
            const data = new FormData();
            for (const value of values) data.append(this.name, value);
            this.internals.setFormValue(data);
        } else {
            this.internals.setFormValue(values[0]);
        }

        const missing = this.hasAttribute("required") &&
            (values.length === 0 || values.every(value => value === ""));
        if (this.disabled || !missing) this.internals.setValidity({});
        else this.internals.setValidity(
            { valueMissing: true },
            "Select an option.",
            this.control,
        );
        this.errorElement.textContent = this.showValidation && missing
            ? "Select an option."
            : "";
        this.errorElement.hidden = !this.errorElement.textContent;
    }

    openListbox(direction = 1) {
        if (this.disabled || this.optionModels.length === 0) return;
        this.open = true;
        this.toggleAttribute("data-open", true);
        this.listbox.hidden = false;
        this.control.setAttribute("aria-expanded", "true");
        const selectedIndex = this.optionModels.findIndex(option =>
            this.selectedValuesState.includes(option.value) && !option.disabled
        );
        this.activeIndex = selectedIndex >= 0
            ? selectedIndex
            : this.nextEnabledIndex(direction > 0 ? -1 : this.optionModels.length, direction);
        queueMicrotask(() => this.focusOption(this.activeIndex));
    }

    closeListbox(restoreFocus = true) {
        if (!this.open) return;
        this.open = false;
        this.toggleAttribute("data-open", false);
        this.listbox.hidden = true;
        this.control.setAttribute("aria-expanded", "false");
        if (restoreFocus) this.control.focus();
    }

    selectIndex(index) {
        const option = this.optionModels[index];
        if (!option || option.disabled || this.disabled) return;
        if (this.multiple) {
            const values = new Set(this.selectedValuesState);
            if (values.has(option.value)) values.delete(option.value);
            else values.add(option.value);
            this.requestedValues = [...values];
        } else {
            this.requestedValues = [option.value];
        }
        this.applyValues(this.requestedValues);
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        if (!this.multiple) this.closeListbox(true);
        else this.focusOption(index);
    }

    nextEnabledIndex(start, direction) {
        if (!this.optionModels.length) return -1;
        let index = start;
        for (let count = 0; count < this.optionModels.length; count++) {
            index = (index + direction + this.optionModels.length) % this.optionModels.length;
            if (!this.optionModels[index].disabled) return index;
        }
        return -1;
    }

    focusOption(index) {
        if (index < 0) return;
        this.activeIndex = index;
        this.listbox.querySelector(`[data-index="${index}"]`)?.focus();
    }

    upgradeProperty(name) {
        if (!Object.prototype.hasOwnProperty.call(this, name)) return;
        const value = this[name];
        delete this[name];
        this[name] = value;
    }

    onControlClick = () => {
        if (this.open) this.closeListbox(false);
        else this.openListbox(1);
    };

    onControlKeydown = event => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const direction = ["ArrowUp", "End"].includes(event.key) ? -1 : 1;
            this.openListbox(direction);
        } else if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            this.open ? this.closeListbox(false) : this.openListbox(1);
        }
    };

    onOptionClick = event => {
        const option = event.target.closest(".option");
        if (!option) return;
        this.selectIndex(Number(option.dataset.index));
    };

    onOptionKeydown = event => {
        if (event.key === "Escape") {
            event.preventDefault();
            this.closeListbox(true);
            return;
        }
        if (event.key === "Tab") {
            this.closeListbox(false);
            return;
        }
        if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            this.selectIndex(this.activeIndex);
            return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Home") this.activeIndex = this.nextEnabledIndex(-1, 1);
        else if (event.key === "End") this.activeIndex = this.nextEnabledIndex(0, -1);
        else this.activeIndex = this.nextEnabledIndex(
            this.activeIndex,
            event.key === "ArrowDown" ? 1 : -1,
        );
        this.focusOption(this.activeIndex);
    };

    onDocumentPointerDown = event => {
        if (this.open && !event.composedPath().includes(this))
            this.closeListbox(false);
    };

    onInvalid = () => {
        this.showValidation = true;
        this.updateFormValue();
        this.control.focus();
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicSelect);
