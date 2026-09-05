import { mossaColorSchemeCss } from "./colorSchemes";

class MossaSelect extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
        "accessible-label",
        "disabled",
        "hint",
        "label",
        "multiple",
        "name",
        "placeholder",
        "presentation",
        "required",
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
        this.presentationQuery = null;
        this.activePresentation = null;
        this.root.innerHTML = `
            <style>
                ${mossaColorSchemeCss()}

                :host {
                    --_mossa-field-background: var(--ulvia-surface-background);
                    --_mossa-field-border: var(--ulvia-surface-border);
                    --_mossa-field-color: var(--ulvia-surface-text);
                    position: relative;
                    display: block;
                    box-sizing: border-box;
                    min-width: min(12rem, 100%);
                    max-width: 100%;
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

                .label { font-weight: var(--_mossa-label-weight, 650); }

                .custom-shell,
                .native-shell {
                    position: relative;
                    min-width: 0;
                }

                .control,
                .native-control {
                    box-sizing: border-box;
                    width: 100%;
                    min-height: var(--_mossa-input-height, 2.75rem);
                    padding: var(--_mossa-input-padding, var(--ulvia-space-sm) calc(var(--ulvia-space-sm) + var(--ulvia-space-xs)));
                    border: var(--_mossa-input-border, 1px solid var(--_mossa-input-border-color, var(--_mossa-field-border)));
                    border-radius: var(--_mossa-input-radius, var(--ulvia-radius-card));
                    background: var(--_mossa-input-background, var(--_mossa-field-background));
                    color: var(--_mossa-input-color, var(--_mossa-field-color));
                    font: inherit;
                    text-align: left;
                    cursor: pointer;
                }

                .control {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: .75rem;
                }

                .native-control {
                    display: block;
                    appearance: none;
                    padding-inline-end: 2.25rem;
                }

                :host([multiple]) .native-control { padding-inline-end: .75rem; }
                :host([multiple]) .native-shell::after { display: none; }

                .control:focus-visible,
                .native-control:focus-visible {
                    outline: 2px solid var(--_mossa-focus-color, var(--_mossa-tone-focus));
                    outline-offset: 2px;
                }

                .value {
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .value[data-placeholder="true"] {
                    color: var(--_mossa-muted-color, var(--ulvia-surface-muted-text));
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

                .native-shell::after {
                    position: absolute;
                    top: 50%;
                    right: .9rem;
                    width: .55rem;
                    height: .55rem;
                    border-right: 1.5px solid currentColor;
                    border-bottom: 1.5px solid currentColor;
                    content: "";
                    pointer-events: none;
                    transform: translateY(-65%) rotate(45deg);
                }

                .listbox {
                    position: absolute;
                    z-index: var(--_mossa-select-z-index, 1000);
                    inset: calc(100% + .3rem) 0 auto;
                    display: grid;
                    max-height: var(--_mossa-select-max-height, 17rem);
                    padding: .3rem;
                    overflow-y: auto;
                    border: 1px solid var(--_mossa-input-border-color, var(--_mossa-field-border));
                    border-radius: var(--_mossa-input-radius, var(--ulvia-radius-card));
                    background: var(--_mossa-input-background, var(--_mossa-field-background));
                    color: var(--_mossa-input-color, var(--_mossa-field-color));
                    box-shadow: var(--_mossa-select-shadow, var(--ulvia-shadow-lg));
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
                    border-radius: calc(var(--_mossa-input-radius, var(--ulvia-radius-card)) - .15rem);
                    background: transparent;
                    color: inherit;
                    font: inherit;
                    text-align: left;
                    cursor: pointer;
                }

                .option:hover:not(:disabled),
                .option:focus-visible {
                    outline: none;
                    background: color-mix(in srgb, var(--_mossa-focus-color, var(--_mossa-tone-focus)) 12%, transparent);
                }

                .option[aria-selected="true"] {
                    background: color-mix(in srgb, var(--_mossa-focus-color, var(--_mossa-tone-focus)) 18%, transparent);
                    font-weight: 650;
                }

                .option[aria-selected="true"]::after {
                    content: "✓";
                    color: var(--_mossa-focus-color, var(--_mossa-tone-focus));
                    font-weight: 800;
                }

                .option:disabled { cursor: not-allowed; opacity: .5; }
                :host([disabled]) { opacity: .6; }
                :host([disabled]) .control,
                :host([disabled]) .native-control { cursor: not-allowed; }
                .hint { color: var(--_mossa-muted-color, var(--ulvia-surface-muted-text)); }
                .error { color: var(--_mossa-error-color, var(--ulvia-danger-base)); }
                .source { display: none; }
                [hidden] { display: none; }

                @media (prefers-reduced-motion: reduce) {
                    .chevron { transition: none; }
                }
            </style>
            <div class="field" part="field">
                <span id="field-label" class="label" part="label"></span>
                <div class="custom-shell">
                    <button class="control" part="control" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="listbox" aria-describedby="hint error">
                        <span id="control-value" class="value" part="value"></span>
                        <span class="chevron" part="chevron" aria-hidden="true"></span>
                    </button>
                    <div id="listbox" class="listbox" part="listbox" role="listbox" hidden></div>
                </div>
                <div class="native-shell" hidden>
                    <select class="native-control" part="control native-control" aria-describedby="hint error"></select>
                </div>
                <small id="hint" class="hint" part="hint"></small>
                <small id="error" class="error" part="error" aria-live="polite"></small>
            </div>
            <div class="source" aria-hidden="true"><slot></slot></div>
        `;
        this.labelElement = this.root.querySelector(".label");
        this.customShell = this.root.querySelector(".custom-shell");
        this.control = this.root.querySelector(".control");
        this.valueElement = this.root.querySelector(".value");
        this.listbox = this.root.querySelector(".listbox");
        this.nativeShell = this.root.querySelector(".native-shell");
        this.nativeControl = this.root.querySelector(".native-control");
        this.hintElement = this.root.querySelector(".hint");
        this.errorElement = this.root.querySelector(".error");
        this.slotElement = this.root.querySelector("slot");
        this.observer = new MutationObserver(this.rebuild);
    }

    connectedCallback() {
        this.upgradeProperty("value");
        this.presentationQuery =
            this.ownerDocument.defaultView?.matchMedia?.("(hover: none) and (pointer: coarse)") ?? null;
        this.addPresentationQueryListener();
        this.control.addEventListener("click", this.onControlClick);
        this.control.addEventListener("keydown", this.onControlKeydown);
        this.nativeControl.addEventListener("input", this.onNativeInput);
        this.nativeControl.addEventListener("change", this.onNativeChange);
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
        this.removePresentationQueryListener();
        this.presentationQuery = null;
        this.control.removeEventListener("click", this.onControlClick);
        this.control.removeEventListener("keydown", this.onControlKeydown);
        this.nativeControl.removeEventListener("input", this.onNativeInput);
        this.nativeControl.removeEventListener("change", this.onNativeChange);
        this.listbox.removeEventListener("click", this.onOptionClick);
        this.listbox.removeEventListener("keydown", this.onOptionKeydown);
        this.slotElement.removeEventListener("slotchange", this.rebuild);
        this.removeEventListener("invalid", this.onInvalid);
        document.removeEventListener("pointerdown", this.onDocumentPointerDown);
        this.observer.disconnect();
        this.closeListbox(false);
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) {
            return;
        }
        const restorePresentationFocus = ["multiple", "presentation"].includes(name) && Boolean(this.focusedControl);
        if (name === "value") {
            this.requestedValues = this.normalizeValues(this.getAttribute("value"));
            this.applyValues(this.requestedValues);
        } else if (name === "multiple") {
            this.requestedValues = this.normalizeValues(this.value);
            this.applyValues(this.requestedValues);
        }
        this.sync(restorePresentationFocus);
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
        return this.multiple ? [...this.selectedValuesState] : (this.selectedValuesState[0] ?? "");
    }

    set value(value) {
        this.requestedValues = this.normalizeValues(value);
        if (this.isConnected) {
            this.applyValues(this.requestedValues);
        }
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
        this.activeControl.focus(options);
    }

    sync(restorePresentationFocus = false) {
        this.labelElement.textContent = this.getAttribute("label") || "";
        this.labelElement.hidden = !this.labelElement.textContent;
        this.hintElement.textContent = this.getAttribute("hint") || "";
        this.hintElement.hidden = !this.hintElement.textContent;
        if (this.disabled && this.open) {
            this.closeListbox(false);
        }
        this.control.setAttribute("aria-expanded", String(this.open));
        this.nativeControl.multiple = this.multiple;
        this.nativeControl.required = this.hasAttribute("required");
        const accessibleLabel = this.getAttribute("accessible-label") || "";
        if (this.labelElement.textContent) {
            this.control.setAttribute("aria-labelledby", "field-label control-value");
            this.control.removeAttribute("aria-label");
            this.nativeControl.setAttribute("aria-labelledby", "field-label");
            this.nativeControl.removeAttribute("aria-label");
            this.listbox.setAttribute("aria-label", this.labelElement.textContent);
        } else if (accessibleLabel) {
            this.control.removeAttribute("aria-labelledby");
            this.control.setAttribute("aria-label", accessibleLabel);
            this.nativeControl.removeAttribute("aria-labelledby");
            this.nativeControl.setAttribute("aria-label", accessibleLabel);
            this.listbox.setAttribute("aria-label", accessibleLabel);
        } else {
            this.control.removeAttribute("aria-labelledby");
            this.control.removeAttribute("aria-label");
            this.nativeControl.removeAttribute("aria-labelledby");
            this.nativeControl.removeAttribute("aria-label");
            this.listbox.removeAttribute("aria-label");
        }
        this.listbox.setAttribute("aria-multiselectable", String(this.multiple));
        this.renderValue();
        this.renderOptions();
        this.syncPresentation(restorePresentationFocus);
        this.updateFormValue();
    }

    addPresentationQueryListener() {
        if (!this.presentationQuery) {
            return;
        }
        if (typeof this.presentationQuery.addEventListener === "function") {
            this.presentationQuery.addEventListener("change", this.onPresentationQueryChange);
        } else {
            this.presentationQuery.addListener?.(this.onPresentationQueryChange);
        }
    }

    removePresentationQueryListener() {
        if (!this.presentationQuery) {
            return;
        }
        if (typeof this.presentationQuery.removeEventListener === "function") {
            this.presentationQuery.removeEventListener("change", this.onPresentationQueryChange);
        } else {
            this.presentationQuery.removeListener?.(this.onPresentationQueryChange);
        }
    }

    resolvePresentation() {
        const requested = (this.getAttribute("presentation") || "auto").trim().toLowerCase();
        if (requested === "native" || requested === "custom") {
            return requested;
        }
        return this.presentationQuery?.matches && !this.multiple ? "native" : "custom";
    }

    syncPresentation(forceRestoreFocus = false) {
        const next = this.resolvePresentation();
        const previous = this.activePresentation;
        const focused = this.focusedControl;
        const shouldRestoreFocus =
            forceRestoreFocus ||
            Boolean(previous && focused && (this.customShell.contains(focused) || this.nativeShell.contains(focused)));

        if (next !== previous && this.open) {
            this.closeListbox(false);
        }
        this.activePresentation = next;
        this.setAttribute("data-resolved-presentation", next);
        this.customShell.hidden = next !== "custom";
        this.customShell.inert = next !== "custom";
        this.nativeShell.hidden = next !== "native";
        this.nativeShell.inert = next !== "native";
        this.control.disabled = this.disabled || next !== "custom";
        this.nativeControl.disabled = this.disabled || next !== "native";

        if (next !== previous && shouldRestoreFocus) {
            queueMicrotask(() => {
                if (this.isConnected) {
                    this.activeControl.focus({ preventScroll: true });
                }
            });
        }
    }

    rebuild = () => {
        const previousValues = this.requestedValues ?? [...this.selectedValuesState];
        this.optionModels = Array.from(this.querySelectorAll(":scope > mossa-option")).map((source, index) => ({
            source,
            index,
            value: source.getAttribute("value") ?? source.textContent.trim(),
            label: source.textContent.trim(),
            disabled: source.hasAttribute("disabled"),
            selected: source.hasAttribute("selected"),
        }));

        if (!this.defaultsCaptured && this.requestedValues === undefined) {
            const explicitValue = this.getAttribute("value");
            if (explicitValue !== null) {
                this.requestedValues = this.normalizeValues(explicitValue);
            } else {
                const authored = this.optionModels.filter((option) => option.selected).map((option) => option.value);
                this.requestedValues = authored.length
                    ? this.multiple
                        ? authored
                        : authored.slice(0, 1)
                    : !this.multiple && this.optionModels.length
                      ? [this.optionModels[0].value]
                      : [];
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
        if (!this.multiple) {
            return [raw];
        }
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

    applyValues(values) {
        const requested = this.multiple ? values : values.slice(0, 1);
        const available = new Set(this.optionModels.map((option) => option.value));
        this.selectedValuesState = requested.filter((value) => available.has(value));
        this.renderValue();
        this.renderOptions();
        this.updateFormValue();
    }

    renderValue() {
        const selected = new Set(this.selectedValuesState);
        const labels = this.optionModels.filter((option) => selected.has(option.value)).map((option) => option.label);
        const placeholder = this.getAttribute("placeholder") || "Select an option";
        this.valueElement.textContent = labels.length ? labels.join(", ") : placeholder;
        this.valueElement.dataset.placeholder = String(labels.length === 0);
    }

    renderOptions() {
        const selected = new Set(this.selectedValuesState);
        this.listbox.replaceChildren(
            ...this.optionModels.map((option, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "option";
                button.dataset.index = String(index);
                button.setAttribute("role", "option");
                button.setAttribute("aria-selected", String(selected.has(option.value)));
                button.disabled = option.disabled || this.disabled;
                button.textContent = option.label;
                return button;
            }),
        );

        const nativeOptions = this.optionModels.map((option) => {
            const element = document.createElement("option");
            element.value = option.value;
            element.textContent = option.label;
            element.disabled = option.disabled;
            element.selected = selected.has(option.value);
            return element;
        });
        let emptySelectionIndex = -1;
        if (!this.multiple && selected.size === 0) {
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = this.getAttribute("placeholder") || "Select an option";
            placeholder.disabled = true;
            placeholder.hidden = true;
            placeholder.selected = true;
            nativeOptions.unshift(placeholder);
            emptySelectionIndex = 0;
        }
        this.nativeControl.replaceChildren(...nativeOptions);
        if (this.multiple) {
            for (const option of this.nativeControl.options) {
                option.selected = selected.has(option.value);
            }
        } else {
            const selectedIndex = Array.from(this.nativeControl.options).findIndex((option) =>
                selected.has(option.value),
            );
            this.nativeControl.selectedIndex = selectedIndex >= 0 ? selectedIndex : emptySelectionIndex;
        }
    }

    updateFormValue() {
        const values = this.selectedValuesState;
        if (this.disabled || !this.name || values.length === 0) {
            this.internals.setFormValue(null);
        } else if (this.multiple) {
            const data = new FormData();
            for (const value of values) {
                data.append(this.name, value);
            }
            this.internals.setFormValue(data);
        } else {
            this.internals.setFormValue(values[0]);
        }

        const missing = this.hasAttribute("required") && (values.length === 0 || values.every((value) => value === ""));
        const exposeInvalidity = !this.disabled && this.showValidation && missing;
        this.control.setAttribute("aria-invalid", String(exposeInvalidity));
        this.nativeControl.setAttribute("aria-invalid", String(exposeInvalidity));
        if (this.disabled || !missing) {
            this.internals.setValidity({});
        } else {
            this.internals.setValidity({ valueMissing: true }, "Select an option.", this.activeControl);
        }
        this.errorElement.textContent = this.showValidation && missing ? "Select an option." : "";
        this.errorElement.hidden = !this.errorElement.textContent;
    }

    openListbox(direction = 1) {
        if (this.activePresentation !== "custom" || this.disabled || this.optionModels.length === 0) {
            return;
        }
        this.open = true;
        this.toggleAttribute("data-open", true);
        this.listbox.hidden = false;
        this.control.setAttribute("aria-expanded", "true");
        const selectedIndex = this.optionModels.findIndex(
            (option) => this.selectedValuesState.includes(option.value) && !option.disabled,
        );
        this.activeIndex =
            selectedIndex >= 0
                ? selectedIndex
                : this.nextEnabledIndex(direction > 0 ? -1 : this.optionModels.length, direction);
        queueMicrotask(() => this.focusOption(this.activeIndex));
    }

    closeListbox(restoreFocus = true) {
        if (!this.open) {
            return;
        }
        this.open = false;
        this.toggleAttribute("data-open", false);
        this.listbox.hidden = true;
        this.control.setAttribute("aria-expanded", "false");
        if (restoreFocus) {
            this.control.focus();
        }
    }

    selectIndex(index) {
        const option = this.optionModels[index];
        if (!option || option.disabled || this.disabled) {
            return;
        }
        if (this.multiple) {
            const values = new Set(this.selectedValuesState);
            if (values.has(option.value)) {
                values.delete(option.value);
            } else {
                values.add(option.value);
            }
            this.requestedValues = [...values];
        } else {
            this.requestedValues = [option.value];
        }
        this.applyValues(this.requestedValues);
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        if (!this.multiple) {
            this.closeListbox(true);
        } else {
            this.focusOption(index);
        }
    }

    nextEnabledIndex(start, direction) {
        if (!this.optionModels.length) {
            return -1;
        }
        let index = start;
        for (let count = 0; count < this.optionModels.length; count++) {
            index = (index + direction + this.optionModels.length) % this.optionModels.length;
            if (!this.optionModels[index].disabled) {
                return index;
            }
        }
        return -1;
    }

    focusOption(index) {
        if (index < 0) {
            return;
        }
        this.activeIndex = index;
        this.listbox.querySelector(`[data-index="${index}"]`)?.focus();
    }

    upgradeProperty(name) {
        if (!Object.prototype.hasOwnProperty.call(this, name)) {
            return;
        }
        const value = this[name];
        delete this[name];
        this[name] = value;
    }

    get activeControl() {
        return this.activePresentation === "native" ? this.nativeControl : this.control;
    }

    get focusedControl() {
        const documentActive = this.ownerDocument.activeElement;
        if (documentActive !== this) {
            return this.customShell.contains(documentActive) || this.nativeShell.contains(documentActive)
                ? documentActive
                : null;
        }
        try {
            return this.root.activeElement;
        } catch {
            return null;
        }
    }

    onPresentationQueryChange = () => {
        this.syncPresentation();
        this.updateFormValue();
    };

    onNativeInput = (event) => {
        event.stopPropagation();
    };

    onNativeChange = (event) => {
        event.stopPropagation();
        if (this.activePresentation !== "native" || this.disabled) {
            return;
        }
        this.requestedValues = this.multiple
            ? Array.from(this.nativeControl.selectedOptions, (option) => option.value)
            : this.nativeControl.selectedIndex < 0
              ? []
              : [this.nativeControl.value];
        this.applyValues(this.requestedValues);
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };

    onControlClick = () => {
        if (this.open) {
            this.closeListbox(false);
        } else {
            this.openListbox(1);
        }
    };

    onControlKeydown = (event) => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const direction = ["ArrowUp", "End"].includes(event.key) ? -1 : 1;
            this.openListbox(direction);
        } else if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            this.open ? this.closeListbox(false) : this.openListbox(1);
        }
    };

    onOptionClick = (event) => {
        const option = event.target.closest(".option");
        if (!option) {
            return;
        }
        this.selectIndex(Number(option.dataset.index));
    };

    onOptionKeydown = (event) => {
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
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            return;
        }
        event.preventDefault();
        if (event.key === "Home") {
            this.activeIndex = this.nextEnabledIndex(-1, 1);
        } else if (event.key === "End") {
            this.activeIndex = this.nextEnabledIndex(0, -1);
        } else {
            this.activeIndex = this.nextEnabledIndex(this.activeIndex, event.key === "ArrowDown" ? 1 : -1);
        }
        this.focusOption(this.activeIndex);
    };

    onDocumentPointerDown = (event) => {
        if (this.open && !event.composedPath().includes(this)) {
            this.closeListbox(false);
        }
    };

    onInvalid = () => {
        this.showValidation = true;
        this.updateFormValue();
        this.focus();
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaSelect);
