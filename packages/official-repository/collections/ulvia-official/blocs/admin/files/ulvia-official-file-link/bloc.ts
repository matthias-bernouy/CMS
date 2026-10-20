import { mutationFormRequest, createBlocScope } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private button: HTMLButtonElement | null = null;

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.button = this.scope.querySelector(":scope > button");
        this.button?.addEventListener("click", this.open);
    }

    disconnect(): void {
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
            const url = await this.signedUrl();
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
        const fileId = this.blocRoot.getAttribute("file-id")?.trim();
        const generation = this.blocRoot.getAttribute("generation")?.trim();
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
        const output = this.scope.querySelector<HTMLOutputElement>("output[name='file-link-error']");
        if (output) {
            output.textContent = visible
                ? (this.scope.querySelector<HTMLOutputElement>("output[name='file-link-error-label']")?.textContent ??
                  "")
                : "";
        }
    }
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
