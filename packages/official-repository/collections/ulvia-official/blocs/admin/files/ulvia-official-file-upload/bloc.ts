import { Component, mutationFormRequest } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { writeWorkspaceUpload } from "./runtime/upload";

type UploadTicket = Readonly<{ uploadId: string; uploadToken: string }>;
type UploadState = "idle" | "uploading" | "uploaded" | "replaced" | "upload-error" | "replacement-error";

export class Bloc extends Component {
    private lifecycle = new AbortController();

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.lifecycle = new AbortController();
        this.addEventListener("change", this.handleChange);
        this.show("idle");
    }

    disconnectedCallback(): void {
        this.lifecycle.abort();
        this.removeEventListener("change", this.handleChange);
    }

    private handleChange = (event: Event): void => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== "file" || !this.contains(input)) {
            return;
        }
        const file = input.files?.[0];
        if (file && file.size > 0) {
            void this.upload(input, file);
        }
    };

    private async upload(input: HTMLInputElement, file: File): Promise<void> {
        const fileId = this.getAttribute("file-id")?.trim();
        input.disabled = true;
        this.show("uploading");
        try {
            const ticket = (await mutationFormRequest(this, "fileUploadCreate", {
                filename: file.name,
                contentType: file.type || null,
                size: file.size,
                visibility: this.getAttribute("visibility") === "public" ? "public" : "private",
                ...(fileId ? { fileId } : {}),
            })) as UploadTicket;
            await writeWorkspaceUpload(ticket, file, this.lifecycle.signal);
            await mutationFormRequest(this, "fileUploadComplete", { uploadId: ticket.uploadId });
            input.value = "";
            this.show(fileId ? "replaced" : "uploaded");
            if (!fileId) {
                this.closest("dialog")?.close();
            }
        } catch {
            if (!this.lifecycle.signal.aborted) {
                this.show(fileId ? "replacement-error" : "upload-error");
            }
        } finally {
            input.disabled = false;
        }
    }

    private show(state: UploadState): void {
        const status = this.querySelector<HTMLOutputElement>("output[name='upload-status']");
        if (status) {
            status.textContent =
                state === "idle"
                    ? ""
                    : (this.querySelector<HTMLOutputElement>(`output[name='${state}-label']`)?.textContent ?? "");
        }
    }
}
