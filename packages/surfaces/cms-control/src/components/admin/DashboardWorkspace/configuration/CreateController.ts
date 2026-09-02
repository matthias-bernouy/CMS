type ValueControl = HTMLElement & {
    value: string;
    focus(): void;
    reportValidity(): boolean;
    setCustomValidity(message: string): void;
};

export class CmsDashboardCreateController extends HTMLElement {
    private form: HTMLFormElement | null = null;
    private nameControl: ValueControl | null = null;
    private idControl: ValueControl | null = null;
    private idEdited = false;

    connectedCallback(): void {
        queueMicrotask(() => this.bind());
    }

    disconnectedCallback(): void {
        this.unbind();
    }

    private bind(): void {
        this.unbind();
        const formId = this.getAttribute("form");
        const form = formId ? this.ownerDocument.getElementById(formId) : this.closest("form");
        if (!(form instanceof HTMLFormElement)) {
            return;
        }
        const name = form.querySelector<ValueControl>("[name='name']");
        const id = form.querySelector<ValueControl>("[name='id']");
        if (!name || !id) {
            return;
        }
        this.form = form;
        this.nameControl = name;
        this.idControl = id;
        this.idEdited = Boolean(id.value);
        name.addEventListener("input", this.onNameInput);
        id.addEventListener("input", this.onIdInput);
        form.addEventListener("reset", this.onReset);
        form.addEventListener("cms-source:failed", this.onFailure as EventListener);
        form.addEventListener("cms-source:success", this.onSuccess as EventListener);
    }

    private unbind(): void {
        this.nameControl?.removeEventListener("input", this.onNameInput);
        this.idControl?.removeEventListener("input", this.onIdInput);
        this.form?.removeEventListener("reset", this.onReset);
        this.form?.removeEventListener("cms-source:failed", this.onFailure as EventListener);
        this.form?.removeEventListener("cms-source:success", this.onSuccess as EventListener);
        this.form = null;
        this.nameControl = null;
        this.idControl = null;
    }

    private readonly onNameInput = (): void => {
        this.nameControl?.setCustomValidity("");
        if (!this.idEdited && this.idControl) {
            this.idControl.value = deriveDashboardId(this.nameControl?.value ?? "");
            this.idControl.setCustomValidity("");
        }
    };

    private readonly onIdInput = (): void => {
        this.idEdited = true;
        this.idControl?.setCustomValidity("");
    };

    private readonly onReset = (): void => {
        queueMicrotask(() => {
            this.idEdited = false;
            this.nameControl?.setCustomValidity("");
            this.idControl?.setCustomValidity("");
        });
    };

    private readonly onFailure = (event: CustomEvent<{ body?: unknown }>): void => {
        const body = event.detail?.body as { error?: unknown; field?: unknown } | undefined;
        const control = body?.field === "id" ? this.idControl : body?.field === "name" ? this.nameControl : null;
        if (!control || typeof body?.error !== "string") {
            return;
        }
        control.setCustomValidity(body.error);
        control.reportValidity();
        control.focus();
    };

    private readonly onSuccess = (event: CustomEvent<{ body?: unknown }>): void => {
        const body = event.detail?.body as { id?: unknown } | undefined;
        if (typeof body?.id !== "string" || !body.id) {
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set("id", body.id);
        window.history.replaceState(null, "", url);
    };
}

export function deriveDashboardId(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64)
        .replace(/-$/g, "");
}
