import type { SiteBlocDefinition } from "@bernouy/cms-content";
import { Shell } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { PreviewAccessibilityIssue } from "./previewAccessibility";
import type { SiteBlocMetadata, SiteBlocMode } from "./siteBlocApi";

type BuilderShell = Shell & {
    requestSave(): void;
    setEditorMode(mode: "edit" | "view"): void;
};

export class SiteBlocView {
    readonly shell: BuilderShell;
    private readonly detailsButton: HTMLButtonElement;

    constructor(private readonly root: ShadowRoot) {
        this.shell = this.require<BuilderShell>("cms-editor-shell");
        this.detailsButton = this.require('[data-action="details"]');
        this.require<HTMLAnchorElement>("[data-back]").href = `${getMetaBasePath()}/admin/blocs`;
    }

    metadata(): SiteBlocMetadata {
        return {
            name: this.field("name").value.trim(),
            group: this.field("group").value.trim(),
            description: this.field("description").value.trim(),
        };
    }

    setDefinition(definition: SiteBlocDefinition): void {
        const { draft } = definition;
        this.require("[data-name]").textContent = draft.name;
        this.require("[data-tag]").textContent = definition.tag;
        this.require("[data-dialog-tag]").textContent = definition.tag;
        this.field("name").value = draft.name;
        this.field("group").value = draft.group;
        this.field("description").value = draft.description;
        const state = this.require("[data-state]");
        const unpublished = definition.publishedRevision !== definition.draftRevision;
        state.textContent =
            definition.lifecycle === "archived" ? "Archived" : unpublished ? "Draft changes" : "Published";
        state.dataset.tone = definition.lifecycle === "archived" ? "archived" : unpublished ? "warning" : "published";
        const archive = this.require<HTMLButtonElement>('[data-action="archive"]');
        archive.textContent = definition.lifecycle === "archived" ? "Restore" : "Archive";
    }

    setMode(mode: SiteBlocMode): void {
        for (const button of Array.from(this.root.querySelectorAll<HTMLButtonElement>("[data-mode]"))) {
            button.ariaPressed = String(button.dataset.mode === mode);
        }
    }

    setControls(input: { busy: boolean; ready: boolean; dirty: boolean; definition: SiteBlocDefinition | null }): void {
        this.require(".builder").setAttribute("aria-busy", String(input.busy));
        const disabled = input.busy || !input.ready || !input.definition;
        const archived = input.definition?.lifecycle === "archived";
        for (const button of Array.from(this.root.querySelectorAll<HTMLButtonElement>("[data-mode], [data-action]"))) {
            if (button.dataset.action === "close-details" || button.dataset.action === "details") {
                button.disabled = input.busy || !input.definition;
                continue;
            }
            button.disabled = disabled;
        }
        if (archived) {
            for (const button of Array.from(
                this.root.querySelectorAll<HTMLButtonElement>(
                    '[data-mode], [data-action="save"], [data-action="preview"], [data-action="publish"]',
                ),
            )) {
                button.disabled = true;
            }
            this.require<HTMLButtonElement>('[data-action="archive"]').disabled = input.busy;
        }
        const publish = this.require<HTMLButtonElement>('[data-action="publish"]');
        if (input.definition) {
            const unpublished = input.definition.publishedRevision !== input.definition.draftRevision;
            publish.disabled = disabled || input.definition.lifecycle === "archived" || (!input.dirty && !unpublished);
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

    openDetails(): void {
        this.require("[data-details-dialog]").hidden = false;
        this.field("name").focus();
    }

    closeDetails(): void {
        this.require("[data-details-dialog]").hidden = true;
        this.detailsButton.focus();
    }

    detailsOpen(): boolean {
        return !this.require("[data-details-dialog]").hidden;
    }

    async simplifyShellChrome(): Promise<void> {
        await customElements.whenDefined("cms-editor-v2-topbar");
        const topBar = this.shell.shadowRoot?.querySelector<HTMLElement>("cms-editor-v2-topbar");
        const chrome = topBar?.shadowRoot;
        chrome?.querySelector<HTMLElement>(".start")?.setAttribute("hidden", "");
        chrome?.querySelector<HTMLElement>(".end")?.setAttribute("hidden", "");
        const bar = chrome?.querySelector<HTMLElement>(".topbar");
        if (bar) {
            bar.style.gridTemplateColumns = "1fr";
        }
    }

    setReadOnly(readOnly: boolean): void {
        const topBar = this.shell.shadowRoot?.querySelector<HTMLElement>("cms-editor-v2-topbar");
        const edit = topBar?.shadowRoot?.querySelector<HTMLButtonElement>('[data-editor-mode="edit"]');
        if (edit) {
            edit.disabled = readOnly;
        }
        this.shell.toggleAttribute("data-builder-read-only", readOnly);
    }

    private field(name: keyof SiteBlocMetadata): HTMLInputElement | HTMLTextAreaElement {
        return this.require(`[data-field="${name}"]`);
    }

    private require<T extends Element = HTMLElement>(selector: string): T {
        const element = this.root.querySelector<T>(selector);
        if (!element) {
            throw new Error(`Site bloc builder is missing ${selector}`);
        }
        return element;
    }
}
