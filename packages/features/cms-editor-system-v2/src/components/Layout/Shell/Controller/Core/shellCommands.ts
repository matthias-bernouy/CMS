import type { Editor, SettingControl } from "@bernouy/cms-content/editor";
import type { CanvasFrameReadyDetail } from "../../../Canvas/Canvas";
import type { ShellSelection } from "../shellSelection";
import type { ShellFrameEventHandlers, ShellFrames } from "../shellFrames";
import type { SelectOptions } from "../shellTypes";
import type { InlineTextEditing } from "../../Domain/Settings/inlineTextEditing";
import { dispatchDeleteDocument, dispatchSaveDocument, handleShellFrameReady } from "./Document/shellDocumentFlow";
import type { ShellRenderSyncCommands } from "./shellRenderSyncCommands";
import type { ShellControllerHost } from "./Services/shellServiceTypes";
import type { ShellState } from "./Services/shellState";
import type { SettingsViewAttributeChanges } from "../../../../Settings/SettingsView/SettingsView";

type CommandsContext = {
    host: ShellControllerHost;
    state: ShellState;
    frames: ShellFrames;
    selection: ShellSelection;
    renderSync: ShellRenderSyncCommands;
    inlineText: InlineTextEditing;
    frameEventHandlers(): ShellFrameEventHandlers;
    saveEventName: string;
    deleteEventName: string;
};

export class ShellCommands {
    constructor(private readonly context: CommandsContext) {}

    dispatchDeleteDocument(): void {
        dispatchDeleteDocument(this.context.host, this.context.deleteEventName);
    }

    saveDocument(): void {
        this.context.inlineText.stop();
        dispatchSaveDocument({
            host: this.context.host,
            pageConfig: () => this.context.state.pageConfig,
            contentHtml: () => this.getContentHtml(),
            syncEditorMode: () => this.syncEditorMode(),
            setSaveStatus: (label) => this.setSaveStatus(label),
            saveEventName: this.context.saveEventName,
        });
    }

    handleFrameReady(detail: CanvasFrameReadyDetail): void {
        handleShellFrameReady({
            frames: this.context.frames,
            detail,
            bindViewFrameDocument: (document) => this.bindViewFrameDocument(document),
            bindFrameDocument: (document) => this.bindFrameDocument(document),
            syncViewFrameContent: () => this.syncViewFrameContent(),
            syncBindingPreviewCore: () => this.syncBindingPreviewCore(),
            loadDocument: (document) => this.context.host.loadDocument(document),
            clearDocument: () => this.clearDocument(),
            renderStructure: () => this.renderStructure(),
            settings: () => this.context.renderSync.settings(),
        });
    }

    select(editor: Editor | null, options: SelectOptions = {}): void {
        this.context.inlineText.stopUnless(editor);
        this.context.selection.select(editor, options);
    }

    renderSettings(): void {
        this.context.selection.renderSettings();
    }

    applySetting(
        editor: Editor,
        setting: SettingControl,
        value: string | boolean,
        attributes?: SettingsViewAttributeChanges,
    ): void {
        this.context.selection.applySetting(editor, setting, value, attributes);
    }

    toggleState(editor: Editor, state: Parameters<ShellSelection["toggleState"]>[1]): void {
        this.context.selection.toggleState(editor, state);
    }

    exitAllStateSessions(): void {
        this.context.selection.exitAllStateSessions();
    }

    bindFrameDocument(document: Document): void {
        this.context.inlineText.reset();
        this.context.frames.bindFrameDocument(document, this.context.frameEventHandlers());
    }

    bindViewFrameDocument(document: Document): void {
        this.context.frames.bindViewFrameDocument(document, this.context.state.previewMode);
    }

    unbindFrameDocument(): void {
        this.context.inlineText.reset();
        this.context.frames.unbindFrameDocument(this.context.frameEventHandlers());
    }

    unbindViewFrameDocument(): void {
        this.context.frames.unbindViewFrameDocument();
    }

    clearDocument(): void {
        this.context.inlineText.reset();
        this.context.state.runtime?.dispose();
        this.context.state.runtime = null;
        this.context.state.editorDocument = null;
    }

    renderStructure(options: SelectOptions = {}): void {
        this.context.renderSync.renderStructure(options);
    }

    isEmptyDocumentContent(): boolean {
        return this.context.renderSync.isEmptyDocumentContent();
    }

    syncSettingsTabs(): void {
        this.context.renderSync.syncSettingsTabs();
    }

    syncViewport(): void {
        this.context.renderSync.syncViewport();
    }

    syncEditorMode(): void {
        if (this.context.state.editorMode !== "edit") {
            this.context.inlineText.stop();
        }
        this.context.renderSync.syncEditorMode();
    }

    refreshInlineTextEditing(): void {
        this.context.inlineText.refresh(this.context.state.runtime?.getStructure() ?? []);
    }

    resetInlineTextEditing(): void {
        this.context.inlineText.reset();
    }

    syncBindingPreviewCore(): void {
        this.context.renderSync.syncBindingPreviewCore();
    }

    syncViewFrameContent(): void {
        this.context.renderSync.syncViewFrameContent();
    }

    getContentHtml(): string {
        return this.context.renderSync.getContentHtml();
    }

    setSaveStatus(label: string): void {
        this.context.renderSync.setSaveStatus(label);
    }
}
