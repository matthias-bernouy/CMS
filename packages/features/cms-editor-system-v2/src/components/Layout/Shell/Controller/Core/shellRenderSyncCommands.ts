import type { Editor } from "@bernouy/cms-content/editor";
import type { SettingsView } from "../../../../Settings/SettingsView/SettingsView";
import { isEmptyDocumentContent } from "../../Domain/Structure/structureDocument";
import { renderStructure } from "../../Domain/Structure/structureRender";
import type { ShellDomRefs } from "../../Domain/shellDomRefs";
import type { ShellSync } from "../shellSync";
import type { ShellFrames } from "../shellFrames";
import { syncViewport } from "../shellViewport";
import type { SelectOptions } from "../shellTypes";
import type { ShellControllerInternals } from "./Services/shellServiceTypes";

type RenderSyncContext = {
    host: ShellControllerInternals;
    refs: ShellDomRefs;
    frames: ShellFrames;
    sync: ShellSync;
};

export class ShellRenderSyncCommands {
    constructor(private readonly context: RenderSyncContext) {}

    renderStructure(options: SelectOptions = {}): void {
        renderStructure(
            this.context.refs.structureTree,
            this.context.host._runtime,
            this.context.host._catalog,
            this.context.host._insertItems,
            () => this.isEmptyDocumentContent(),
            options,
        );
    }

    isEmptyDocumentContent(): boolean {
        return isEmptyDocumentContent(this.context.host._editorDocument?.contentRoot);
    }

    syncSettingsTabs(): void {
        const buttons = this.context.refs.settingsTabs.querySelectorAll<HTMLButtonElement>("[data-settings-mode]");
        for (const button of Array.from(buttons)) {
            const isActive = button.dataset.settingsMode === this.context.host._settingsMode;
            button.classList.toggle("active", isActive);
            button.ariaPressed = String(isActive);
        }
    }

    syncViewport(): void {
        syncViewport(
            this.context.refs.canvas,
            this.context.refs.topBar,
            this.context.host._viewport,
        );
    }

    syncEditorMode(): void {
        this.context.refs.topBar.mode = this.context.host._editorMode;
        this.context.refs.topBar.sourceState = this.context.host._sourceStateForce;
        this.context.host.toggleAttribute("view-mode", this.context.host._editorMode === "view");
        this.context.refs.canvas.setAttribute("mode", this.context.host._editorMode);
        this.syncBindingPreviewCore();
    }

    syncBindingPreviewCore(): void {
        this.context.frames.syncBindingPreviewCore(this.context.host._sourceStateForce);
    }

    syncViewFrameContent(): void {
        this.context.frames.syncViewFrameContent(this.context.host._sourceStateForce);
    }

    syncChromeLabels(): void {
        this.context.sync.syncChromeLabels();
    }

    openPageSettings(): void {
        this.context.sync.openPageSettings();
    }

    closePageSettings(): void {
        this.context.sync.closePageSettings();
    }

    syncPageSettingsForm(): void {
        this.context.sync.syncPageSettingsForm();
    }

    applyPageSettingsForm(): void {
        this.context.sync.applyPageSettingsForm();
    }

    getContentHtml(): string {
        return this.context.frames.contentHtml();
    }

    setSaveStatus(label: string): void {
        this.context.sync.setSaveStatus(label);
    }

    syncStructureTreeCatalog(): void {
        this.context.sync.syncStructureTreeCatalog();
    }

    syncStructureTreeInsertItems(): void {
        this.context.sync.syncStructureTreeInsertItems();
    }

    syncStructureTreeDefaultTemplateSelection(): void {
        this.context.sync.syncStructureTreeDefaultTemplateSelection();
    }

    syncStructureTreeDataSources(): void {
        this.context.sync.syncStructureTreeDataSources();
    }

    findStructureNodeLabel(editor: Editor): string | null {
        return this.context.sync.findStructureNodeLabel(editor);
    }

    settings(): SettingsView {
        return this.context.refs.settings;
    }
}
