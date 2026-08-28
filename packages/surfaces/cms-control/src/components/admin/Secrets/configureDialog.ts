import { opConfigureSecret } from "./ops";

type SecretValueInput = HTMLElement & { value: string };
type SubmitButton = HTMLElement & { disabled: boolean };

export class SecretConfigureDialog {
    private readonly modal: HTMLElement;
    private readonly title: HTMLElement;
    private readonly form: HTMLFormElement;
    private readonly input: SecretValueInput;
    private readonly submitButton: SubmitButton;
    private key: string | null = null;
    private pending = false;
    private token = 0;

    constructor(
        root: ShadowRoot,
        private readonly api: () => string,
    ) {
        this.modal = root.querySelector('[data-role="configure-modal"]')!;
        this.title = root.querySelector('[data-role="configure-title"]')!;
        this.form = root.querySelector('[data-role="configure-form"]')!;
        this.input = root.querySelector('[data-role="configure-value"]')!;
        this.submitButton = root.querySelector('[data-action="configure-confirm"]')!;
        this.form.addEventListener("submit", (event) => void this.submit(event));
        this.input.addEventListener("input", this.syncSubmitState);
        this.input.addEventListener("change", this.syncSubmitState);
        root.querySelector('[data-action="configure-cancel"]')!.addEventListener("click", this.close);
        this.modal.addEventListener("close", this.clear);
    }

    open(key: string): void {
        this.token++;
        this.key = key;
        this.pending = false;
        this.input.value = "";
        this.title.textContent = `Configure ${key}`;
        this.modal.setAttribute("aria-label", `Configure ${key} secret`);
        this.syncSubmitState();
        this.modal.setAttribute("open", "");
        queueMicrotask(() => this.input.focus());
    }

    close = (): void => {
        this.modal.removeAttribute("open");
        this.clear();
    };

    private clear = (): void => {
        this.token++;
        this.key = null;
        this.pending = false;
        this.input.value = "";
        this.submitButton.removeAttribute("aria-busy");
        this.syncSubmitState();
    };

    private syncSubmitState = (): void => {
        this.submitButton.disabled = this.pending || this.input.value.length === 0;
    };

    private async submit(event: SubmitEvent): Promise<void> {
        event.preventDefault();
        if (!this.key || this.pending || !this.form.reportValidity()) {
            return;
        }
        const token = this.token;
        const key = this.key;
        const value = this.input.value;
        this.pending = true;
        this.submitButton.setAttribute("aria-busy", "true");
        this.syncSubmitState();
        try {
            const saved = await opConfigureSecret(this.api(), key, value);
            if (saved && token === this.token) {
                this.close();
            }
        } finally {
            if (token === this.token) {
                this.pending = false;
                this.submitButton.removeAttribute("aria-busy");
                this.syncSubmitState();
            }
        }
    }
}
