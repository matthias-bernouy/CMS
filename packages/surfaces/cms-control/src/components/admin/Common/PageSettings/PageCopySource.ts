import { resolvePageForm } from "./pageFormFields";

type CheckboxControl = HTMLElement & { checked: boolean };
type PageLookupControl = HTMLElement & { value: string };
type PageOption = { path: string; title: string };

export class PageCopySource extends HTMLElement {
    static readonly observedAttributes = ["form"];

    private form: HTMLFormElement | null = null;
    private toggle: CheckboxControl | null = null;
    private field: HTMLElement | null = null;
    private lookup: PageLookupControl | null = null;
    private request: AbortController | null = null;

    connectedCallback(): void {
        queueMicrotask(() => this.bind());
    }

    disconnectedCallback(): void {
        this.unbind();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            queueMicrotask(() => this.bind());
        }
    }

    private bind(): void {
        this.unbind();
        const form = resolvePageForm(this);
        const toggle = form?.querySelector<CheckboxControl>("[data-page-copy-toggle]") ?? null;
        const field = form?.querySelector<HTMLElement>("[data-page-copy-field]") ?? null;
        const lookup = form?.querySelector<PageLookupControl>("[data-page-copy-lookup]") ?? null;
        if (!form || !toggle || !field || !lookup) {
            return;
        }
        this.form = form;
        this.toggle = toggle;
        this.field = field;
        this.lookup = lookup;
        toggle.addEventListener("change", this.onToggle);
        form.addEventListener("reset", this.onReset);
        form.addEventListener("cms-source:success", this.onReset);
        form.ownerDocument.addEventListener("new:page", this.onPagesChanged);
        this.sync();
        if (toggle.checked) {
            void this.reload();
        }
    }

    private unbind(): void {
        this.toggle?.removeEventListener("change", this.onToggle);
        this.form?.removeEventListener("reset", this.onReset);
        this.form?.removeEventListener("cms-source:success", this.onReset);
        this.form?.ownerDocument.removeEventListener("new:page", this.onPagesChanged);
        this.request?.abort();
        this.request = null;
        this.form = null;
        this.toggle = null;
        this.field = null;
        this.lookup = null;
    }

    private readonly onToggle = (): void => {
        this.sync();
        if (this.toggle?.checked) {
            void this.reload();
        }
    };

    private readonly onPagesChanged = (): void => {
        void this.reload();
    };

    private readonly onReset = (): void => {
        queueMicrotask(() => {
            if (this.lookup) {
                this.lookup.value = "";
            }
            this.sync();
        });
    };

    private sync(): void {
        if (!this.toggle || !this.field || !this.lookup) {
            return;
        }
        const enabled = this.toggle.checked;
        this.field.hidden = !enabled;
        this.lookup.toggleAttribute("disabled", !enabled);
        this.lookup.toggleAttribute("required", enabled);
    }

    private async reload(): Promise<void> {
        const lookup = this.lookup;
        const url = lookup?.getAttribute("data-source-url")?.trim();
        if (!lookup || !url) {
            return;
        }
        this.request?.abort();
        const request = new AbortController();
        this.request = request;
        try {
            const response = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: request.signal,
            });
            if (!response.ok) {
                lookup.setAttribute("invalid", "");
                return;
            }
            const pages = await response.json();
            if (request.signal.aborted || this.lookup !== lookup || !Array.isArray(pages)) {
                return;
            }
            lookup.replaceChildren(...pages.flatMap((page) => this.option(page)));
            lookup.removeAttribute("invalid");
        } catch {
            if (!request.signal.aborted) {
                lookup.setAttribute("invalid", "");
            }
        } finally {
            if (this.request === request) {
                this.request = null;
            }
        }
    }

    private option(value: unknown): HTMLOptionElement[] {
        if (!isPageOption(value)) {
            return [];
        }
        const option = this.ownerDocument.createElement("option");
        option.value = value.path;
        option.textContent = `${value.title} — ${value.path}`;
        return [option];
    }
}

function isPageOption(value: unknown): value is PageOption {
    const candidate = value as Partial<PageOption> | null;
    return typeof candidate?.path === "string" && typeof candidate.title === "string";
}
