import { CapabilityError } from "./client";

export class EditorStatus {
    private busy = false;

    constructor(private readonly root: ShadowRoot) {}

    async run(task: () => Promise<void>): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.setBusy(true);
        try {
            await task();
        } catch (error) {
            const suffix = error instanceof CapabilityError ? ` (${error.code})` : "";
            this.notice(`${error instanceof Error ? error.message : "Request failed"}${suffix}`, true);
        } finally {
            this.setBusy(false);
            this.busy = false;
        }
    }

    notice(message: string, error = false): void {
        const notice = this.required("[data-notice]");
        notice.textContent = message;
        notice.toggleAttribute("data-error", error);
    }

    private setBusy(busy: boolean): void {
        this.required("[part=editor]").setAttribute("aria-busy", String(busy));
        for (const button of this.root.querySelectorAll<HTMLButtonElement>("button")) {
            button.disabled = busy;
        }
    }

    private required(selector: string): HTMLElement {
        const element = this.root.querySelector<HTMLElement>(selector);
        if (!element) {
            throw new Error(`Missing Page editor element: ${selector}`);
        }
        return element;
    }
}
