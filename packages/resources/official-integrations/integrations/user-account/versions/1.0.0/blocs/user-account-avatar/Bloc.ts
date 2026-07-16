import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class UserAccountAvatar extends Component {
    static formAssociated = true;
    static observedAttributes = [
        "accept",
        "accent-color",
        "action-text-color",
        "background-color",
        "border-color",
        "disabled",
        "hint",
        "name",
        "src",
    ];

    constructor() {
        super({ css, template });
        this.internals = this.attachInternals();
        this.objectUrl = null;
        this.input = this.shadowRoot.querySelector("input");
        this.image = this.shadowRoot.querySelector("img");
        this.placeholder = this.shadowRoot.querySelector("[data-placeholder]");
        this.hintElement = this.shadowRoot.querySelector("[data-hint]");
    }

    connectedCallback() {
        this.input.addEventListener("input", this.onInput);
        this.input.addEventListener("change", this.onChange);
        this.sync();
    }

    disconnectedCallback() {
        this.input.removeEventListener("input", this.onInput);
        this.input.removeEventListener("change", this.onChange);
        this.revokeObjectUrl();
    }

    attributeChangedCallback() {
        if (this.isConnected) this.sync();
    }

    formResetCallback() {
        this.input.value = "";
        this.revokeObjectUrl();
        this.sync();
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

    get files() {
        return this.input.files;
    }

    get disabled() {
        return this.hasAttribute("disabled");
    }

    set disabled(value) {
        this.toggleAttribute("disabled", Boolean(value));
    }

    get hasSelection() {
        return Boolean(this.input.files?.length);
    }

    focus(options) {
        this.input.focus(options);
    }

    sync() {
        this.syncColors();
        const accept = this.getAttribute("accept");
        if (accept === null) this.input.removeAttribute("accept");
        else this.input.setAttribute("accept", accept);
        this.input.disabled = this.disabled;

        const hint = this.getAttribute("hint") || "JPEG, PNG, WebP ou GIF, 5 Mio maximum.";
        this.hintElement.textContent = hint;
        this.hintElement.hidden = !hint;

        if (!this.hasSelection) this.showImage(this.getAttribute("src") || "");
        this.updateFormValue();
    }

    syncColors() {
        for (const [attribute, property] of [
            ["accent-color", "--account-avatar-accent"],
            ["action-text-color", "--account-avatar-action-color"],
            ["background-color", "--account-avatar-background"],
            ["border-color", "--account-avatar-border"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) this.style.setProperty(property, value);
            else this.style.removeProperty(property);
        }
    }

    updateFormValue() {
        const file = this.input.files?.[0] || null;
        this.internals.setFormValue(this.disabled || !this.name ? null : file);
        this.internals.setValidity({});
    }

    showImage(src) {
        if (src) {
            this.image.src = src;
            this.image.hidden = false;
            this.placeholder.hidden = true;
            return;
        }
        this.image.removeAttribute("src");
        this.image.hidden = true;
        this.placeholder.hidden = false;
    }

    showSelectedFile() {
        const file = this.input.files?.[0];
        this.revokeObjectUrl();
        if (!file) {
            this.showImage(this.getAttribute("src") || "");
            return;
        }
        this.objectUrl = URL.createObjectURL(file);
        this.showImage(this.objectUrl);
    }

    revokeObjectUrl() {
        if (!this.objectUrl) return;
        URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
    }

    onInput = () => {
        this.showSelectedFile();
        this.updateFormValue();
        this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    };

    onChange = () => {
        this.showSelectedFile();
        this.updateFormValue();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", UserAccountAvatar);
