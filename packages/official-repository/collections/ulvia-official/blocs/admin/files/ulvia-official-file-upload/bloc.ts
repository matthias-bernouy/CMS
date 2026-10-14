import { Component, mutationFormRequest } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { writeWorkspaceUpload } from "./runtime/upload";

type UploadTicket = Readonly<{ uploadId: string; uploadToken: string }>;
type UploadState = "idle" | "uploading" | "uploaded" | "replaced" | "upload-error" | "replacement-error";

export class Bloc extends Component {
    private lifecycle = new AbortController();
    private input: HTMLInputElement | null = null;

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.lifecycle = new AbortController();
        this.input = this.querySelector("input[type='file']");
        this.input?.addEventListener("change", this.handleChange);
        this.show("idle");
    }

    disconnectedCallback(): void {
        this.lifecycle.abort();
        this.input?.removeEventListener("change", this.handleChange);
        this.input = null;
    }

    private handleChange = (): void => {
        const file = this.input?.files?.[0];
        if (file && file.size > 0) {
            void this.upload(file);
        }
    };

    private async upload(file: File): Promise<void> {
        const fileId = this.getAttribute("file-id")?.trim();
        if (this.input) {
            this.input.disabled = true;
        }
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
            if (this.input) {
                this.input.value = "";
            }
            this.show(fileId ? "replaced" : "uploaded");
        } catch {
            if (!this.lifecycle.signal.aborted) {
                this.show(fileId ? "replacement-error" : "upload-error");
            }
        } finally {
            if (this.input) {
                this.input.disabled = false;
            }
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
