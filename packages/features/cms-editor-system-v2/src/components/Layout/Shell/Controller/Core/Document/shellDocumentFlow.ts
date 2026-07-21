import type { EditorDocument } from "@bernouy/cms-content/editor";

import type { SettingsView } from "../../../../../Settings/SettingsView/SettingsView";
import type { CanvasFrameReadyDetail } from "../../../../Canvas/Canvas";
import type { ShellFrames } from "../../shellFrames";
import type { EditorV2PageConfig, EditorV2SaveDocumentDetail } from "../../shellTypes";

type SaveContext = {
    host: EventTarget;
    pageConfig(): EditorV2PageConfig | null;
    contentHtml(): string;
    syncEditorMode(): void;
    setSaveStatus(label: string): void;
    saveEventName: string;
};

export function dispatchSaveDocument(context: SaveContext): void {
    const pageConfig = context.pageConfig();
    if (!pageConfig) {
        context.setSaveStatus("No page");
        return;
    }

    context.syncEditorMode();
    context.setSaveStatus("Saving");
    context.host.dispatchEvent(
        new CustomEvent<EditorV2SaveDocumentDetail>(context.saveEventName, {
            bubbles: true,
            composed: true,
            detail: {
                page: {
                    ...pageConfig,
                    tags: [...pageConfig.tags],
                },
                content: context.contentHtml(),
            },
        }),
    );
}

export function dispatchDeleteDocument(host: EventTarget, eventName: string): void {
    host.dispatchEvent(
        new CustomEvent(eventName, {
            bubbles: true,
            composed: true,
        }),
    );
}

type FrameReadyContext = {
    frames: ShellFrames;
    detail: CanvasFrameReadyDetail;
    bindViewFrameDocument(document: Document): void;
    bindFrameDocument(document: Document): void;
    syncViewFrameContent(): void;
    syncBindingPreviewCore(): void;
    loadDocument(document: EditorDocument): void;
    clearDocument(): void;
    renderStructure(): void;
    settings(): SettingsView;
};

export function handleShellFrameReady(context: FrameReadyContext): void {
    context.frames.handleFrameReady(context.detail.kind, context.detail.document, {
        bindViewFrameDocument: context.bindViewFrameDocument,
        bindFrameDocument: context.bindFrameDocument,
        syncViewFrameContent: context.syncViewFrameContent,
        syncBindingPreviewCore: context.syncBindingPreviewCore,
        loadDocument: context.loadDocument,
        clearDocument: context.clearDocument,
        renderStructure: context.renderStructure,
        settings: context.settings,
    });
}
