import { BlocBehavior, mutationFormRequest } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    private button: HTMLButtonElement | null = null;

    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        this.button = this.querySelector(":scope > button");
        this.button?.addEventListener("click", this.open);
    }

    disconnectedCallback(): void {
        this.button?.removeEventListener("click", this.open);
        this.button = null;
    }

    private open = async (): Promise<void> => {
        if (!this.button) {
            return;
        }
        this.button.disabled = true;
        this.showError(false);
        try {
            const url = this.getAttribute("url")?.trim() || (await this.signedUrl());
            const target = new URL(url, location.href);
            if (target.origin !== location.origin || !target.pathname.startsWith("/.cms/call/ulvia.cms.files/files/")) {
                throw new Error();
            }
            const anchor = document.createElement("a");
            anchor.href = target.href;
            anchor.rel = "noopener";
            anchor.click();
        } catch {
            this.showError(true);
        } finally {
            this.button.disabled = false;
        }
    };

    private async signedUrl(): Promise<string> {
        const fileId = this.getAttribute("file-id")?.trim();
        const generation = this.getAttribute("generation")?.trim();
        if (!fileId || !generation) {
            throw new Error();
        }
        const result = (await mutationFormRequest(this.blocRoot, "privateFileSign", {
            fileId,
            generation,
            expiresIn: 300,
        })) as { url?: unknown };
        if (typeof result.url !== "string") {
            throw new Error();
        }
        return result.url;
    }

    private showError(visible: boolean): void {
        const output = this.querySelector<HTMLOutputElement>("output[name='file-link-error']");
        if (output) {
            output.textContent = visible
                ? (this.querySelector<HTMLOutputElement>("output[name='file-link-error-label']")?.textContent ?? "")
                : "";
        }
    }
}
