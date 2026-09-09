import { Component } from "@bernouy/components/base";
import {
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    type SourceObservation,
} from "@bernouy/components/binding";
import { accountCopyAttributes, accountFields } from "../copy";
import { accountPresentation } from "../presentation";

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
        "field-appearance",
        "field-tone",
        ...accountCopyAttributes,
        ...accountFields.map((field) => `show-${field}`),
    ];

    private avatarFileId = "";
    private saveAfterAvatar = false;
    private stopIdentity: (() => void) | null = null;
    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.accountSource, (account) => ({
            identity: readSourceData(this.identitySource),
            presentation: accountPresentation(this, account, this.avatarFileId),
        }));
        this.stopIdentity = observeSource(this.identitySource, this.onIdentityState);
        this.addEventListener("submit", this.onSubmit, true);
        this.addEventListener("cms-source:success", this.onSourceSuccess as EventListener);
        this.addEventListener("cms-source:failed", this.onSourceFailed as EventListener);
    }

    disconnectedCallback(): void {
        this.stopIdentity?.();
        this.stopIdentity = null;
        this.removeEventListener("submit", this.onSubmit, true);
        this.removeEventListener("cms-source:success", this.onSourceSuccess as EventListener);
        this.removeEventListener("cms-source:failed", this.onSourceFailed as EventListener);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.accountSource);
        }
    }

    private readonly onSubmit = (event: Event): void => {
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        if (!form || form.getAttribute("cms-source-id") !== "save" || this.saveAfterAvatar) {
            return;
        }
        const avatar = this.querySelector<HTMLElement & { files?: FileList }>("mossa-user-account-avatar");
        if (!avatar?.files?.[0] || !form.reportValidity()) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        this.saveAfterAvatar = true;
        this.avatarForm?.requestSubmit();
    };

    private readonly onSourceSuccess = (event: CustomEvent<{ body?: unknown }>): void => {
        const source = event.target instanceof Element ? event.target.getAttribute("cms-source-id") : "";
        if (source !== "avatar") {
            return;
        }
        const body = record(event.detail?.body);
        this.avatarFileId = typeof body?.avatarFileId === "string" ? body.avatarFileId : "";
        const avatarField = this.saveForm?.elements.namedItem("avatarFileId");
        if (avatarField instanceof HTMLInputElement) {
            avatarField.value = this.avatarFileId;
        }
        const avatar = this.querySelector<HTMLElement>("mossa-user-account-avatar");
        if (avatar && this.avatarFileId) {
            avatar.setAttribute(
                "src",
                `/.cms/sources/user-account/getAccountAvatar?fileId=${encodeURIComponent(this.avatarFileId)}`,
            );
        }
        if (this.saveAfterAvatar) {
            this.saveAfterAvatar = false;
            queueMicrotask(() => this.saveForm?.requestSubmit());
        }
    };

    private readonly onSourceFailed = (event: Event): void => {
        if (event.target instanceof Element && event.target.getAttribute("cms-source-id") === "avatar") {
            this.saveAfterAvatar = false;
        }
    };

    private readonly onIdentityState = (state: SourceObservation): void => {
        if (!state.disposed) {
            refreshSourceContext(this.accountSource);
        }
    };

    private get accountSource(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="account"]')!;
    }

    private get avatarForm(): HTMLFormElement | null {
        return this.querySelector<HTMLFormElement>('[cms-source-id="avatar"]');
    }

    private get identitySource(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="identity"]')!;
    }

    private get saveForm(): HTMLFormElement | null {
        return this.querySelector<HTMLFormElement>('[cms-source-id="save"]');
    }
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", UserAccountForm);
