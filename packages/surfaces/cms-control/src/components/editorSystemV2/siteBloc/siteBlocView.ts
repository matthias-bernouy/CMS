import type { SiteBlocDefinition } from "@bernouy/cms-content";
import { Shell } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { PreviewAccessibilityIssue } from "./previewAccessibility";

type BuilderShell = Shell & {
    requestSave(): void;
    setEditorMode(mode: "edit" | "view"): void;
};

export class SiteBlocView {
    readonly shell: BuilderShell;
    private topBar: HTMLElement | null = null;
    private publishButton: HTMLButtonElement | null = null;

    constructor(private readonly root: ShadowRoot) {
        this.shell = this.require<BuilderShell>("cms-editor-shell");
        this.shell.setAttribute("back-href", `${getMetaBasePath()}/admin/blocs`);
    }

    setDefinition(definition: SiteBlocDefinition): void {
        const archive = this.chromeButton('[data-action="delete"]');
        if (archive) {
            archive.textContent = definition.lifecycle === "archived" ? "Restore" : "Archive";
        }
    }

    setControls(input: { busy: boolean; ready: boolean; dirty: boolean; definition: SiteBlocDefinition | null }): void {
        this.require(".builder").setAttribute("aria-busy", String(input.busy));
        const disabled = input.busy || !input.ready || !input.definition;
        const archived = input.definition?.lifecycle === "archived";
        const settings = this.chromeButton('[data-action="page-settings"]');
        const save = this.chromeButton('[data-action="save"]');
        const archive = this.chromeButton('[data-action="delete"]');
        if (settings) {
            settings.disabled = input.busy || !input.definition || Boolean(archived);
        }
        if (save) {
            save.disabled = disabled || Boolean(archived);
        }
        if (archive) {
            archive.disabled = input.busy || !input.definition || (!input.ready && !archived);
        }
        if (this.publishButton) {
            this.publishButton.disabled = disabled || Boolean(archived);
        }
        if (input.definition && this.publishButton) {
            const unpublished = input.definition.publishedRevision !== input.definition.draftRevision;
            this.publishButton.disabled = disabled || Boolean(archived) || (!input.dirty && !unpublished);
        }
    }

    setStatus(message: string): void {
        this.require("[data-status]").textContent = message;
    }

    showError(message: string | null): void {
        const error = this.require("[data-error]");
        error.hidden = !message;
        error.textContent = message ?? "";
    }

    showAccessibilityReport(issues: PreviewAccessibilityIssue[]): void {
        const total = issues.reduce((sum, issue) => sum + issue.count, 0);
        this.require("[data-a11y-summary]").textContent =
            total === 0
                ? "No issues found in the loaded preview."
                : `${total} potential issue${total === 1 ? "" : "s"}.`;
        const list = this.require<HTMLUListElement>("[data-a11y-list]");
        list.replaceChildren(
            ...issues.map((issue) => {
                const item = document.createElement("li");
                item.textContent = `${issue.count} ${issue.message}`;
                return item;
            }),
        );
        list.hidden = issues.length === 0;
    }

    async configureShellChrome(publish: () => void): Promise<void> {
        await customElements.whenDefined("cms-editor-shell");
        await customElements.whenDefined("cms-editor-v2-topbar");
        const { topBar, end, save } = await this.toolbarElements();
        this.topBar = topBar;
        save.querySelector(".save-label")!.textContent = "Save draft";
        this.publishButton = document.createElement("button");
        this.publishButton.type = "button";
        this.publishButton.dataset.siteBlocAction = "publish";
        this.publishButton.textContent = "Publish";
        this.publishButton.addEventListener("click", publish);
        end.insertBefore(this.publishButton, save);
    }

    setReadOnly(readOnly: boolean): void {
        const edit = this.chromeButton('[data-editor-mode="edit"]');
        if (edit) {
            edit.disabled = readOnly;
        }
        this.shell.toggleAttribute("data-builder-read-only", readOnly);
    }

    private chromeButton(selector: string): HTMLButtonElement | null {
        return this.topBar?.shadowRoot?.querySelector<HTMLButtonElement>(selector) ?? null;
    }

    private async toolbarElements(): Promise<{
        topBar: HTMLElement;
        end: HTMLElement;
        save: HTMLButtonElement;
    }> {
        for (let attempt = 0; attempt < 50; attempt += 1) {
            const topBar = this.shell.shadowRoot?.querySelector<HTMLElement>("cms-editor-v2-topbar");
            const end = topBar?.shadowRoot?.querySelector<HTMLElement>(".end");
            const save = topBar?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="save"]');
            if (topBar && end && save) {
                return { topBar, end, save };
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        throw new Error("Composition editor toolbar is unavailable");
    }

    private require<T extends Element = HTMLElement>(selector: string): T {
        const element = this.root.querySelector<T>(selector);
        if (!element) {
            throw new Error(`Site bloc builder is missing ${selector}`);
        }
        return element;
    }
}
