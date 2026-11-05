import { mutationFormRequest, createBlocScope } from "@bernouy/cms-content/browser";
import { writeWorkspaceUpload } from "./runtime/upload";

type UploadTicket = Readonly<{ uploadId: string; uploadToken: string }>;
type UploadState = "idle" | "uploading" | "uploaded" | "replaced" | "upload-error" | "replacement-error";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private lifecycle = new AbortController();

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.lifecycle = new AbortController();
        this.blocRoot.addEventListener("change", this.handleChange);
        this.show("idle");
    }

    disconnect(): void {
        this.lifecycle.abort();
        this.blocRoot.removeEventListener("change", this.handleChange);
    }

    private handleChange = (event: Event): void => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== "file" || !this.blocRoot.contains(input)) {
            return;
        }
        const file = input.files?.[0];
        if (file && file.size > 0) {
            void this.upload(input, file);
        }
    };

    private async upload(input: HTMLInputElement, file: File): Promise<void> {
        const fileId = this.blocRoot.getAttribute("file-id")?.trim();
        input.disabled = true;
        this.show("uploading");
        try {
            const ticket = (await mutationFormRequest(this.blocRoot, "fileUploadCreate", {
                filename: file.name,
                contentType: file.type || null,
                size: file.size,
                visibility: this.blocRoot.getAttribute("visibility") === "public" ? "public" : "private",
                ...(fileId ? { fileId } : {}),
            })) as UploadTicket;
            await writeWorkspaceUpload(ticket, file, this.lifecycle.signal);
            await mutationFormRequest(this.blocRoot, "fileUploadComplete", { uploadId: ticket.uploadId });
            input.value = "";
            this.show(fileId ? "replaced" : "uploaded");
            if (!fileId) {
                this.blocRoot.closest("dialog")?.close();
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
        const status = this.scope.querySelector<HTMLOutputElement>("output[name='upload-status']");
        if (status) {
            status.textContent =
                state === "idle"
                    ? ""
                    : (this.scope.querySelector<HTMLOutputElement>(`output[name='${state}-label']`)?.textContent ?? "");
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
