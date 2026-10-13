import { Component, sourceFormRequest } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private button: HTMLButtonElement | null = null;

    constructor() {
        super({ css, template });
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
            location.assign(target.href);
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
        const result = (await sourceFormRequest(this, "private-file-sign", {
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
