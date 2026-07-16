import { Composition } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };

const fields = [
    "given-name",
    "surname",
    "birth-date",
    "phone",
    "address-line-1",
    "address-line-2",
    "address-line-3",
    "postal-code",
    "city",
    "region",
    "country-code",
    "locale",
    "timezone",
    "avatar",
];

export class UserAccountForm extends Composition {
    static observedAttributes = [
        "source-id",
        "source-prefix",
        "button-label",
        "show-login-email",
        "text-color",
        "background-color",
        "field-text-color",
        "field-background-color",
        "field-border-color",
        "accent-color",
        "button-text-color",
        "button-background-color",
        "button-border-color",
        "avatar-background-color",
        "avatar-border-color",
        "skeleton-base-color",
        "skeleton-highlight-color",
        "toast-position",
        "toast-width",
        "toast-density",
        "toast-radius",
        "toast-shadow",
        "success-toast-duration",
        "error-toast-duration",
        "success-toast-text-color",
        "success-toast-background-color",
        "success-toast-border-color",
        "error-toast-text-color",
        "error-toast-background-color",
        "error-toast-border-color",
        ...fields.map(field => `show-${field}`),
    ];

    constructor() {
        super({ template });
        this.avatarObserver = null;
        this.sourceBase = "";
        this.saveAfterAvatar = false;
    }

    connectedCallback() {
        this.addEventListener("cms-source:success", this.onSourceSettled);
        this.addEventListener("cms-source:failed", this.onSourceFailed);
        this.addEventListener("submit", this.onSubmitCapture, true);
        super.connectedCallback();

        const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.avatarObserver = new Observer(() => queueMicrotask(() => {
            this.syncColors();
            this.syncAvatarPreview();
        }));
        this.avatarObserver.observe(this, { childList: true, characterData: true, subtree: true });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("cms-source:success", this.onSourceSettled);
        this.removeEventListener("cms-source:failed", this.onSourceFailed);
        this.removeEventListener("submit", this.onSubmitCapture, true);
        this.avatarObserver?.disconnect();
        this.avatarObserver = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) queueMicrotask(() => this.sync());
    }

    sync() {
        const prefix = (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
        const sourceId = encodeURIComponent(this.getAttribute("source-id") || "user-account");
        this.sourceBase = `${prefix}/${sourceId}`;

        this.setAttributeIfChanged(this.querySelector("[data-auth-load]"), "cms-source", `${prefix}/system-auth/me`);
        this.setAttributeIfChanged(this.querySelector("[data-account-load]"), "cms-source", `${this.sourceBase}/getAccount`);
        this.setAttributeIfChanged(this.querySelector("[data-account-form]"), "cms-source", `${this.sourceBase}/updateAccount as save`);
        this.setAttributeIfChanged(this.querySelector("[data-avatar-form]"), "cms-source", `${this.sourceBase}/uploadAccountAvatar as avatar`);

        this.setText("[data-account-button]", this.getAttribute("button-label") || "Enregistrer");
        this.syncColors();

        for (const field of fields) {
            const element = this.querySelector(`[data-account-field="${field}"]`);
            if (!element) continue;
            const visible = this.getAttribute(`show-${field}`) !== "false";
            element.hidden = !visible;
            const control = element.matches?.("[name]") ? element : element.querySelector?.("[name]");
            control?.toggleAttribute("disabled", !visible);
        }
        const loginEmail = this.querySelector('[data-account-field="login-email"]');
        if (loginEmail) loginEmail.hidden = this.getAttribute("show-login-email") === "false";
        this.syncAvatarPreview();
    }

    syncColors() {
        const layout = this.querySelector("[data-account-layout]");
        this.setOptionalAttribute(layout, "text-color", this.getAttribute("text-color"));
        this.setOptionalAttribute(layout, "background-color", this.getAttribute("background-color"));

        for (const input of this.querySelectorAll("basic-input")) {
            this.setOptionalAttribute(input, "text-color", this.getAttribute("field-text-color"));
            this.setOptionalAttribute(input, "background-color", this.getAttribute("field-background-color"));
            this.setOptionalAttribute(input, "border-color", this.getAttribute("field-border-color"));
            this.setOptionalAttribute(input, "accent-color", this.getAttribute("accent-color"));
        }

        const button = this.querySelector("[data-account-button]");
        this.setOptionalAttribute(button, "text-color", this.getAttribute("button-text-color"));
        this.setOptionalAttribute(button, "background-color", this.getAttribute("button-background-color"));
        this.setOptionalAttribute(button, "border-color", this.getAttribute("button-border-color"));
        this.setOptionalAttribute(button, "accent-color", this.getAttribute("accent-color"));

        const avatar = this.querySelector("[data-avatar-input]");
        this.setOptionalAttribute(avatar, "accent-color", this.getAttribute("accent-color"));
        this.setOptionalAttribute(avatar, "action-text-color", this.getAttribute("button-text-color"));
        this.setOptionalAttribute(avatar, "background-color", this.getAttribute("avatar-background-color"));
        this.setOptionalAttribute(avatar, "border-color", this.getAttribute("avatar-border-color"));

        for (const skeleton of this.querySelectorAll("basic-skeleton")) {
            this.setOptionalAttribute(skeleton, "base-color", this.getAttribute("skeleton-base-color"));
            this.setOptionalAttribute(skeleton, "highlight-color", this.getAttribute("skeleton-highlight-color"));
        }

        for (const toast of this.querySelectorAll("basic-toast")) {
            const kind = toast.getAttribute("data-toast-kind") === "success" ? "success" : "error";
            this.setAttributeIfChanged(toast, "position", this.getAttribute("toast-position") || "top-right");
            this.setAttributeIfChanged(toast, "width", this.getAttribute("toast-width") || "auto");
            this.setAttributeIfChanged(toast, "density", this.getAttribute("toast-density") || "regular");
            this.setAttributeIfChanged(toast, "radius", this.getAttribute("toast-radius") || "md");
            this.setAttributeIfChanged(toast, "shadow", this.getAttribute("toast-shadow") || "none");
            this.setAttributeIfChanged(toast, "duration", this.getAttribute(`${kind}-toast-duration`) || (kind === "success" ? "4500" : "6000"));
            this.setOptionalAttribute(toast, "text-color", this.getAttribute(`${kind}-toast-text-color`));
            this.setOptionalAttribute(toast, "close-color", this.getAttribute(`${kind}-toast-text-color`));
            this.setOptionalAttribute(toast, "background-color", this.getAttribute(`${kind}-toast-background-color`));
            this.setOptionalAttribute(toast, "border-color", this.getAttribute(`${kind}-toast-border-color`));
        }
    }

    setAttributeIfChanged(element, name, value) {
        if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
    }

    setOptionalAttribute(element, name, value) {
        if (!element) return;
        const normalized = value?.trim() || "";
        if (!normalized) {
            element.removeAttribute(name);
            return;
        }
        this.setAttributeIfChanged(element, name, normalized);
    }

    setText(selector, value) {
        const element = this.querySelector(selector);
        if (element && element.textContent !== value) element.textContent = value;
    }

    syncAvatarPreview() {
        const avatar = this.querySelector("[data-avatar-input]");
        if (!avatar || avatar.hasSelection) return;

        const fileId = this.querySelector("[data-avatar-file-id]")?.textContent?.trim() || "";
        if (fileId.includes("{{") || fileId.includes("}}")) return;
        if (!fileId) {
            avatar.removeAttribute("src");
            return;
        }

        this.setAttributeIfChanged(
            avatar,
            "src",
            `${this.sourceBase}/getAccountAvatar?fileId=${encodeURIComponent(fileId)}`,
        );
    }

    onSubmitCapture = event => {
        const mainForm = this.querySelector("[data-account-form]");
        if (event.target !== mainForm || this.saveAfterAvatar) return;

        const file = this.querySelector("[data-avatar-input]")?.files?.[0];
        if (!file) return;
        if (typeof mainForm.reportValidity === "function" && !mainForm.reportValidity()) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        this.saveAfterAvatar = true;
        this.querySelector("[data-avatar-form]")?.requestSubmit();
    };

    onSourceSettled = event => {
        if (event.target?.matches?.("[data-avatar-form]")) {
            const fileId = event.detail?.body?.avatarFileId;
            const value = this.querySelector("[data-avatar-file-id]");
            if (value && typeof fileId === "string" && fileId) value.textContent = fileId;

            if (this.saveAfterAvatar) {
                this.saveAfterAvatar = false;
                queueMicrotask(() => this.querySelector("[data-account-form]")?.requestSubmit());
                return;
            }
        }
        queueMicrotask(() => this.sync());
    };

    onSourceFailed = event => {
        if (event.target?.matches?.("[data-avatar-form]")) this.saveAfterAvatar = false;
        queueMicrotask(() => this.syncColors());
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", UserAccountForm);
