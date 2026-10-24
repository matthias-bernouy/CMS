import { CapabilityError } from "./client";

export class EditorStatus {
    private busy = false;
    private readonly disabledState = new WeakMap<HTMLButtonElement, boolean>();
    private noticeTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly root: HTMLElement) {}

    async run(task: () => Promise<void>): Promise<boolean> {
        if (this.busy) {
            return false;
        }
        this.busy = true;
        this.setBusy(true);
        try {
            await task();
            return true;
        } catch (error) {
            const suffix = error instanceof CapabilityError ? ` (${error.code})` : "";
            const fallback =
                this.root.querySelector<HTMLElement>('[data-copy="request-failed"]')?.textContent?.trim() ?? "";
            this.notice(`${error instanceof Error ? error.message : fallback}${suffix}`, true);
            return false;
        } finally {
            this.setBusy(false);
            this.busy = false;
        }
    }

    notice(message: string, error = false): void {
        this.clearNotice();
        for (const notice of this.root.querySelectorAll<HTMLElement>("[data-notice]")) {
            notice.textContent = message;
            notice.toggleAttribute("data-error", error);
        }
        this.noticeTimer = setTimeout(() => this.clearNotice(), error ? 8000 : 3000);
    }

    clearNotice(): void {
        if (this.noticeTimer) {
            clearTimeout(this.noticeTimer);
            this.noticeTimer = null;
        }
        for (const notice of this.root.querySelectorAll<HTMLElement>("[data-notice]")) {
            notice.textContent = "";
            notice.removeAttribute("data-error");
        }
    }

    private setBusy(busy: boolean): void {
        this.required("[part=editor]").setAttribute("aria-busy", String(busy));
        for (const button of this.root.querySelectorAll<HTMLButtonElement>("button")) {
            if (busy) {
                this.disabledState.set(button, button.disabled);
                button.disabled = true;
            } else {
                button.disabled = this.disabledState.get(button) ?? false;
                this.disabledState.delete(button);
            }
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
