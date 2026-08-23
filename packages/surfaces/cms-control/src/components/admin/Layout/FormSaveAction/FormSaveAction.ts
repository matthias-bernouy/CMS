type SaveState = "pristine" | "dirty" | "saving" | "saved";

type ButtonControl = HTMLElement & { disabled: boolean };

export class CmsFormSaveAction extends HTMLElement {
    static readonly observedAttributes = ["label", "form"];

    private readonly button: ButtonControl | null;
    private readonly status: HTMLElement | null;
    private ownerForm: HTMLFormElement | null = null;
    private state: SaveState = "pristine";

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `
            <style>
                :host { display: inline-flex; }
                p9r-button {
                    --_btn-padding-y: .48rem;
                    --_btn-padding-x: .82rem;
                    --_btn-font-size: 12px;
                    --_btn-radius: 6px;
                }
            </style>
            <p9r-button type="button" color="primary"><span data-status aria-live="polite"></span></p9r-button>
        `;
        this.button = root.querySelector("p9r-button") as ButtonControl | null;
        this.status = root.querySelector("[data-status]");
    }

    connectedCallback(): void {
        this.button?.addEventListener("click", this.onClick);
        queueMicrotask(() => this.bindForm());
        this.sync("pristine");
    }

    disconnectedCallback(): void {
        this.button?.removeEventListener("click", this.onClick);
        this.unbindForm();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.bindForm();
            this.sync(this.state);
        }
    }

    private bindForm(): void {
        const id = this.getAttribute("form")?.trim() ?? "";
        const form = id ? this.ownerDocument.getElementById(id) : null;
        if (form === this.ownerForm) {
            return;
        }
        this.unbindForm();
        if (!(form instanceof HTMLFormElement)) {
            return;
        }
        this.ownerForm = form;
        form.addEventListener("input", this.onEdit);
        form.addEventListener("change", this.onEdit);
        form.addEventListener("submit", this.onSubmit);
        form.addEventListener("invalid", this.onInvalid, true);
        form.addEventListener("cms-source:success", this.onSuccess);
        form.addEventListener("cms-source:failed", this.onFailure);
    }

    private unbindForm(): void {
        this.ownerForm?.removeEventListener("input", this.onEdit);
        this.ownerForm?.removeEventListener("change", this.onEdit);
        this.ownerForm?.removeEventListener("submit", this.onSubmit);
        this.ownerForm?.removeEventListener("invalid", this.onInvalid, true);
        this.ownerForm?.removeEventListener("cms-source:success", this.onSuccess);
        this.ownerForm?.removeEventListener("cms-source:failed", this.onFailure);
        this.ownerForm = null;
    }

    private readonly onClick = (): void => this.ownerForm?.requestSubmit();
    private readonly onEdit = (): void => {
        if (this.state !== "saving") {
            this.sync("dirty");
        }
    };
    private readonly onSubmit = (): void => this.sync("saving");
    private readonly onInvalid = (): void => this.sync("dirty");
    private readonly onSuccess = (): void => this.sync("saved");
    private readonly onFailure = (): void => this.sync("dirty");

    private sync(state: SaveState): void {
        this.state = state;
        this.setAttribute("state", state);
        if (this.button) {
            this.button.disabled = state === "pristine" || state === "saving" || state === "saved";
        }
        if (this.status) {
            const label = this.getAttribute("label")?.trim() || "Save";
            this.status.textContent = state === "saving" ? "Saving…" : state === "saved" ? "Saved" : label;
        }
    }
}

if (!customElements.get("cms-form-save-action")) {
    customElements.define("cms-form-save-action", CmsFormSaveAction);
}
