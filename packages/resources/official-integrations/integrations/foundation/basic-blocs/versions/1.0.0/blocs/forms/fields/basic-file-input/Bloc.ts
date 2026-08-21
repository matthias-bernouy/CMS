import { basicColorSchemeCss } from "./colorSchemes";

class BasicFileInput extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
        "accept",
        "capture",
        "disabled",
        "empty-label",
        "hint",
        "label",
        "multiple",
        "name",
        "picker-label",
        "preview-shape",
        "preview-size",
        "required",
    ];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internals = this.attachInternals();
        this.showValidation = false;
        this.previewUrl = "";
        this.previewedFile = null;
        this.root.innerHTML = `
            <style>
                ${basicColorSchemeCss()}
                :host {
                    --_file-background: var(--_tone-base);
                    --_file-border: var(--_tone-border);
                    --_file-color: var(--_tone-foreground);
                    display: block;
                    font: inherit;
                    color: inherit;
                }
                :host([appearance="soft"]) {
                    --_file-background: var(--_tone-muted);
                    --_file-border: var(--_tone-muted);
                    --_file-color: var(--_tone-contrasted);
                }
                :host([appearance="outlined"]) {
                    --_file-background: transparent;
                    --_file-color: var(--_tone-contrasted);
                }
                :host([appearance="ghost"]) {
                    --_file-background: transparent;
                    --_file-border: transparent;
                    --_file-color: var(--_tone-contrasted);
                }
                .field { display: grid; gap: var(--cms-field-gap, .375rem); }
                .label { font: inherit; font-weight: var(--cms-label-weight, 650); }
                .preview {
                    width: var(--cms-file-preview-size, 5rem);
                    height: var(--cms-file-preview-size, 5rem);
                    margin-block-end: .375rem;
                    overflow: hidden;
                    border: 1px solid var(--integration-basic-blocs-field-border, var(--border-default, color-mix(in srgb, currentColor 20%, transparent)));
                    border-radius: var(--cms-file-preview-radius, .75rem);
                    background: var(--bg-subtle, Canvas);
                }
                .selected-preview,
                .preview ::slotted(*) { display: block; width: 100%; height: 100%; object-fit: cover; }
                .selected-preview { background-position: center; background-size: cover; }
                :host([preview-shape="circle"]) .preview { border-radius: 50%; }
                :host([preview-size="small"]) { --cms-file-preview-size: 3.5rem; }
                :host([preview-size="large"]) { --cms-file-preview-size: 7rem; }
                .picker {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: .75rem;
                    min-height: var(--cms-input-height, 2.75rem);
                    width: max-content;
                    max-width: 100%;
                    cursor: pointer;
                }
                .picker-button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 2.5rem;
                    padding: .5rem .8rem;
                    border: 1px solid var(--cms-file-border-color, var(--_file-border));
                    border-radius: var(--cms-input-radius, var(--integration-basic-blocs-action-radius, .5rem));
                    background: var(--cms-file-background, var(--_file-background));
                    color: var(--cms-file-color, var(--_file-color));
                    font-weight: 700;
                    white-space: nowrap;
                }
                .file-name {
                    overflow: hidden;
                    color: var(--integration-basic-blocs-muted-text, var(--text-muted, color-mix(in srgb, currentColor 65%, transparent)));
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                input {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    overflow: hidden;
                    clip: rect(0 0 0 0);
                    clip-path: inset(50%);
                    white-space: nowrap;
                    border: 0;
                }
                .picker:has(input:focus-visible) .picker-button {
                    outline: 2px solid var(--cms-focus-color, var(--_tone-focus));
                    outline-offset: 2px;
                }
                :host([disabled]) { opacity: .6; }
                :host([disabled]) .picker { cursor: not-allowed; }
                .hint { color: var(--cms-muted-color, var(--integration-basic-blocs-muted-text, color-mix(in srgb, currentColor 65%, transparent))); }
                .error { color: var(--cms-error-color, var(--integration-basic-blocs-error-text, #b42318)); }
                [hidden] { display: none; }
            </style>
            <div class="field" part="field">
                <span class="label" part="label"></span>
                <div class="preview" part="preview" hidden>
                    <slot name="preview"></slot>
                </div>
                <label class="picker" part="picker" for="control">
                    <span class="picker-button" part="button"></span>
                    <span class="file-name" part="file-name"></span>
                    <input id="control" part="input" type="file">
                </label>
                <small class="hint" part="hint"></small>
                <small class="error" part="error" aria-live="polite"></small>
            </div>`;
        this.input = this.root.querySelector("input");
        this.labelElement = this.root.querySelector(".label");
        this.pickerLabelElement = this.root.querySelector(".picker-button");
        this.fileNameElement = this.root.querySelector(".file-name");
        this.previewElement = this.root.querySelector(".preview");
        this.selectedPreviewElement = document.createElement("div");
        this.selectedPreviewElement.className = "selected-preview";
        this.selectedPreviewElement.setAttribute("part", "selected-preview");
        this.selectedPreviewElement.setAttribute("role", "img");
        this.selectedPreviewElement.hidden = true;
        this.previewElement.prepend(this.selectedPreviewElement);
        this.previewSlot = this.root.querySelector('slot[name="preview"]');
        this.hintElement = this.root.querySelector(".hint");
        this.errorElement = this.root.querySelector(".error");
    }

    connectedCallback() {
        this.input.addEventListener("input", this.onInput);
        this.input.addEventListener("change", this.onChange);
        this.addEventListener("invalid", this.onInvalid);
        this.previewSlot.addEventListener("slotchange", this.syncPreview);
        this.sync();
    }

    disconnectedCallback() {
        this.input.removeEventListener("input", this.onInput);
        this.input.removeEventListener("change", this.onChange);
        this.removeEventListener("invalid", this.onInvalid);
        this.previewSlot.removeEventListener("slotchange", this.syncPreview);
        this.clearSelectedPreview();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    formResetCallback() {
        this.input.value = "";
        this.showValidation = false;
        this.clearSelectedPreview();
        this.syncFileName();
        this.updateFormValue();
    }

    formDisabledCallback(disabled) {
        this.disabled = disabled;
    }

    get name() {
        return this.getAttribute("name") || "";
    }

    set name(value) {
        value ? this.setAttribute("name", value) : this.removeAttribute("name");
    }

    get value() {
        return this.input.value;
    }

    get files() {
        return this.input.files;
    }

    get disabled() {
        return this.hasAttribute("disabled");
    }

    set disabled(value) {
        this.toggleAttribute("disabled", Boolean(value));
    }

    focus(options) {
        this.input.focus(options);
    }

    sync() {
        this.labelElement.textContent = this.getAttribute("label") || "";
        this.labelElement.hidden = !this.labelElement.textContent;
        this.pickerLabelElement.textContent = this.getAttribute("picker-label") || "Choose file";
        this.hintElement.textContent = this.getAttribute("hint") || "";
        this.hintElement.hidden = !this.hintElement.textContent;

        for (const name of ["accept", "capture"]) {
            const value = this.getAttribute(name);
            if (value === null) {
                this.input.removeAttribute(name);
            } else {
                this.input.setAttribute(name, value);
            }
        }
        for (const name of ["disabled", "multiple", "required"]) {
            this.input.toggleAttribute(name, this.hasAttribute(name));
        }

        this.syncFileName();
        this.syncSelectedPreview();
        this.syncPreview();
        this.updateFormValue();
    }

    syncFileName() {
        const files = Array.from(this.input.files || []);
        this.fileNameElement.textContent = files.length
            ? files.map((file) => file.name).join(", ")
            : this.getAttribute("empty-label") || "No file selected";
    }

    syncSelectedPreview() {
        const file = this.hasAttribute("multiple") ? null : this.input.files?.[0] || null;
        if (file === this.previewedFile) {
            return;
        }
        this.clearSelectedPreview();
        if (!file?.type.startsWith("image/") || typeof URL.createObjectURL !== "function") {
            return;
        }
        this.previewedFile = file;
        this.previewUrl = URL.createObjectURL(file);
        this.selectedPreviewElement.style.backgroundImage = `url(${this.previewUrl})`;
        this.selectedPreviewElement.setAttribute("aria-label", file.name);
        this.selectedPreviewElement.hidden = false;
    }

    clearSelectedPreview() {
        if (this.previewUrl) {
            URL.revokeObjectURL(this.previewUrl);
        }
        this.previewUrl = "";
        this.previewedFile = null;
        this.selectedPreviewElement.style.removeProperty("background-image");
        this.selectedPreviewElement.removeAttribute("aria-label");
        this.selectedPreviewElement.hidden = true;
    }

    syncPreview = () => {
        this.previewElement.hidden =
            this.selectedPreviewElement.hidden && this.previewSlot.assignedElements().length === 0;
    };

    updateFormValue() {
        const files = Array.from(this.input.files || []);
        if (this.disabled || !this.name || files.length === 0) {
            this.internals.setFormValue(null);
        } else if (this.hasAttribute("multiple")) {
            const data = new FormData();
            for (const file of files) {
                data.append(this.name, file);
            }
            this.internals.setFormValue(data);
        } else {
            this.internals.setFormValue(files[0]);
        }

        if (this.disabled || this.input.validity.valid) {
            this.internals.setValidity({});
        } else {
            this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input);
        }
        this.errorElement.textContent = this.showValidation ? this.input.validationMessage || "" : "";
        this.errorElement.hidden = !this.errorElement.textContent;
    }

    onInput = () => {
        this.showValidation = true;
        this.syncFileName();
        this.syncSelectedPreview();
        this.syncPreview();
        this.updateFormValue();
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    };

    onChange = () => {
        this.showValidation = true;
        this.syncFileName();
        this.syncSelectedPreview();
        this.syncPreview();
        this.updateFormValue();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };

    onInvalid = () => {
        this.showValidation = true;
        this.updateFormValue();
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicFileInput);
