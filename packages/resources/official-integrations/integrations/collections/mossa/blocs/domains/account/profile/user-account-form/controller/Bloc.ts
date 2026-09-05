import { Component } from "@bernouy/components/base";

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

export class UserAccountForm extends Component {
    static observedAttributes = [
        "button-label",
        "toast-position",
        "toast-width",
        "toast-density",
        "toast-radius",
        "toast-shadow",
        "success-toast-duration",
        "error-toast-duration",
        ...fields.map((field) => `show-${field}`),
    ];

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
        this.avatarObserver = null;
        this.saveAfterAvatar = false;
    }

    connectedCallback() {
        this.addEventListener("cms-source:success", this.onSourceSettled);
        this.addEventListener("cms-source:failed", this.onSourceFailed);
        this.addEventListener("submit", this.onSubmitCapture, true);
        super.connectedCallback();

        const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.avatarObserver = new Observer(() =>
            queueMicrotask(() => {
                this.syncPresentation();
                this.syncAvatarPreview();
            }),
        );
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
        if (this.isConnected) {
            queueMicrotask(() => this.sync());
        }
    }

    sync() {
        this.setAttributeIfChanged(
            this.querySelector("[data-account-load]"),
            "cms-source",
            "/.cms/sources/user-account/getAccount",
        );
        this.setAttributeIfChanged(
            this.querySelector("[data-account-form]"),
            "cms-source",
            "/.cms/sources/user-account/updateAccount as save",
        );
        this.setAttributeIfChanged(
            this.querySelector("[data-avatar-form]"),
            "cms-source",
            "/.cms/sources/user-account/uploadAccountAvatar as avatar",
        );
        this.setAttributeIfChanged(this.querySelector('[data-account-field="birth-date"]'), "max", currentLocalDate());

        this.setText("[data-account-button]", this.getAttribute("button-label") || "Save");
        this.syncPresentation();

        for (const field of fields) {
            const element = this.querySelector(`[data-account-field="${field}"]`);
            if (!element) {
                continue;
            }
            const visible = this.getAttribute(`show-${field}`) !== "false";
            element.hidden = !visible;
            const control = element.matches?.("[name]") ? element : element.querySelector?.("[name]");
            control?.toggleAttribute("disabled", !visible);
        }
        this.syncAvatarPreview();
    }

    syncPresentation() {
        for (const toast of this.querySelectorAll("mossa-toast")) {
            const kind = toast.getAttribute("data-toast-kind") === "success" ? "success" : "error";
            this.setAttributeIfChanged(toast, "position", this.getAttribute("toast-position") || "top-right");
            this.setAttributeIfChanged(toast, "width", this.getAttribute("toast-width") || "auto");
            this.setAttributeIfChanged(toast, "density", this.getAttribute("toast-density") || "regular");
            this.setAttributeIfChanged(toast, "radius", this.getAttribute("toast-radius") || "md");
            this.setAttributeIfChanged(toast, "shadow", this.getAttribute("toast-shadow") || "none");
            this.setAttributeIfChanged(
                toast,
                "duration",
                this.getAttribute(`${kind}-toast-duration`) || (kind === "success" ? "4500" : "6000"),
            );
        }
    }

    setAttributeIfChanged(element, name, value) {
        if (element && element.getAttribute(name) !== value) {
            element.setAttribute(name, value);
        }
    }

    setText(selector, value) {
        const element = this.querySelector(selector);
        if (element && element.textContent !== value) {
            element.textContent = value;
        }
    }

    syncAvatarPreview() {
        const avatar = this.querySelector("[data-avatar-input]");
        if (!avatar || avatar.hasSelection) {
            return;
        }

        const fileId = this.querySelector("[data-avatar-file-id]")?.textContent?.trim() || "";
        if (fileId.includes("{{") || fileId.includes("}}")) {
            return;
        }
        if (!fileId) {
            avatar.removeAttribute("src");
            return;
        }

        this.setAttributeIfChanged(
            avatar,
            "src",
            `/.cms/sources/user-account/getAccountAvatar?fileId=${encodeURIComponent(fileId)}`,
        );
    }

    onSubmitCapture = (event) => {
        const mainForm = this.querySelector("[data-account-form]");
        if (event.target !== mainForm || this.saveAfterAvatar) {
            return;
        }

        const file = this.querySelector("[data-avatar-input]")?.files?.[0];
        if (!file) {
            return;
        }
        if (typeof mainForm.reportValidity === "function" && !mainForm.reportValidity()) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        this.saveAfterAvatar = true;
        this.querySelector("[data-avatar-form]")?.requestSubmit();
    };

    onSourceSettled = (event) => {
        if (event.target?.matches?.("[data-avatar-form]")) {
            const fileId = event.detail?.body?.avatarFileId;
            const value = this.querySelector("[data-avatar-file-id]");
            if (value && typeof fileId === "string" && fileId) {
                value.textContent = fileId;
            }

            if (this.saveAfterAvatar) {
                this.saveAfterAvatar = false;
                queueMicrotask(() => this.querySelector("[data-account-form]")?.requestSubmit());
                return;
            }
        }
        queueMicrotask(() => this.sync());
    };

    onSourceFailed = (event) => {
        if (event.target?.matches?.("[data-avatar-form]")) {
            this.saveAfterAvatar = false;
        }
        queueMicrotask(() => this.syncPresentation());
    };
}

function currentLocalDate(date = new Date()) {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", UserAccountForm);
