import { addTheme, renameTheme } from "cms-control/components/admin/Theme/editor/model";
import { loadThemeEditingDraft, persistThemeEditingDraft } from "../draft";

type ValueControl = HTMLElement & { value: string };
type Modal = HTMLElement & { show?: () => void };
type ProfileAction = "create" | "rename";

export class ThemeProfileController {
    private action: ProfileAction | undefined;

    constructor(private readonly host: HTMLElement) {}

    connect(): void {
        this.host.addEventListener("click", this.onClick);
        this.host.addEventListener("change", this.onChange);
        this.host.addEventListener("submit", this.onSubmit);
    }

    disconnect(): void {
        this.host.removeEventListener("click", this.onClick);
        this.host.removeEventListener("change", this.onChange);
        this.host.removeEventListener("submit", this.onSubmit);
    }

    setLocked(locked: boolean): void {
        for (const control of Array.from(this.host.querySelectorAll<HTMLElement>("[data-theme-profile-control]"))) {
            control.toggleAttribute("disabled", locked);
        }
    }

    private readonly onChange = (event: Event): void => {
        const control =
            event.target instanceof Element ? event.target.closest<ValueControl>("[data-theme-profile-select]") : null;
        if (control?.value) {
            this.navigate(control.value);
        }
    };

    private readonly onClick = (event: Event): void => {
        const target = event.target instanceof Element ? event.target : null;
        const action = target?.closest<HTMLElement>("[data-theme-profile-action]")?.dataset.themeProfileAction;
        if (action === "create" || action === "rename") {
            this.open(action);
        } else if (action === "activate") {
            void this.activate();
        } else if (target?.closest("[data-theme-profile-cancel]")) {
            this.close();
        }
    };

    private readonly onSubmit = (event: Event): void => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.matches("[data-theme-profile-form]")) {
            return;
        }
        event.preventDefault();
        void this.saveProfile(form);
    };

    private open(action: ProfileAction): void {
        const input = this.input();
        const title = this.host.querySelector<HTMLElement>("[data-theme-profile-modal-title]");
        this.action = action;
        input.value = action === "rename" ? this.selectedName() : "";
        input.removeAttribute("invalid");
        if (title) {
            title.textContent = action === "create" ? "New theme" : "Rename theme";
        }
        const modal = this.modal();
        if (typeof modal.show === "function") {
            modal.show();
        } else {
            modal.setAttribute("open", "");
        }
        queueMicrotask(() => input.focus());
    }

    private close(): void {
        this.modal().removeAttribute("open");
        this.action = undefined;
        this.setStatus("");
    }

    private async saveProfile(form: HTMLFormElement): Promise<void> {
        if (!this.action || !form.reportValidity()) {
            return;
        }
        const name = this.input().value.trim();
        if (!name) {
            return;
        }
        this.setBusy(true);
        this.setStatus("Saving…");
        try {
            const settings = await loadThemeEditingDraft();
            const selectedThemeId = this.action === "create" ? addTheme(settings, name) : this.selectedThemeId();
            if (this.action === "rename" && !renameTheme(settings, selectedThemeId, name)) {
                throw new Error("This theme is unavailable.");
            }
            await persistThemeEditingDraft(settings, this.host.ownerDocument);
            this.close();
            this.navigate(selectedThemeId);
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : "Unable to save theme.", true);
        } finally {
            this.setBusy(false);
        }
    }

    private async activate(): Promise<void> {
        this.setBusy(true);
        this.setStatus("Activating…");
        try {
            const settings = await loadThemeEditingDraft();
            const selectedThemeId = this.selectedThemeId();
            if (!settings.themes.some(({ id }) => id === selectedThemeId)) {
                throw new Error("This theme is unavailable.");
            }
            settings.activeThemeId = selectedThemeId;
            await persistThemeEditingDraft(settings, this.host.ownerDocument);
            window.location.reload();
        } catch (error) {
            this.setStatus(error instanceof Error ? error.message : "Unable to activate theme.", true);
            this.setBusy(false);
        }
    }

    private navigate(themeId: string): void {
        const url = new URL(window.location.href);
        url.searchParams.set("theme", themeId);
        window.location.assign(url);
    }

    private selectedThemeId(): string {
        return this.host.querySelector<ValueControl>("[data-theme-profile-select]")?.value ?? "";
    }

    private selectedName(): string {
        const selectedThemeId = this.selectedThemeId();
        return (
            Array.from(this.host.querySelectorAll<HTMLOptionElement>("[data-theme-profile-select] option"))
                .find(({ value }) => value === selectedThemeId)
                ?.textContent?.trim() ?? ""
        );
    }

    private input(): ValueControl {
        return this.host.querySelector<ValueControl>("[data-theme-profile-name]")!;
    }

    private modal(): Modal {
        return this.host.querySelector<Modal>("[data-theme-profile-modal]")!;
    }

    private setBusy(busy: boolean): void {
        this.modal().toggleAttribute("aria-busy", busy);
        this.setLocked(busy);
        this.host.querySelector<HTMLElement>("[data-theme-profile-submit]")?.toggleAttribute("disabled", busy);
    }

    private setStatus(message: string, error = false): void {
        const status = this.host.querySelector<HTMLElement>("[data-theme-profile-status]");
        if (status) {
            status.textContent = message;
            status.hidden = !message;
            status.toggleAttribute("data-error", error);
        }
    }
}
