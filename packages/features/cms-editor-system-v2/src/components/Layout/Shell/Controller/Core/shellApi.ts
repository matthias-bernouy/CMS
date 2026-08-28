import { type EditorCatalog, type EditorDocument } from "@bernouy/cms-content/editor";

import { EditorRuntime, type EditorDataSource } from "../../../../../runtime";
import type { TopBarEditorMode } from "../../../TopBar/TopBar";
import type { EditorFrameUrls, EditorPreviewMode, EditorV2PageConfig } from "../shellTypes";
import {
    resolveEditorInteractionPolicy,
    type EditorInteractionPolicy,
} from "../../../../../policy/editorInteractionPolicy";
import type { ShellDomRefs } from "../../Domain/shellDomRefs";
import type { ShellCommands } from "./shellCommands";
import type { ShellRenderSyncCommands } from "./shellRenderSyncCommands";
import type { ShellState } from "./Services/shellState";

type ApiContext = {
    host: HTMLElement;
    state: ShellState;
    refs: ShellDomRefs;
    renderSync: ShellRenderSyncCommands;
    commands: ShellCommands;
};

export class ShellApi {
    constructor(private readonly context: ApiContext) {}

    setCatalog(catalog: EditorCatalog): void {
        this.context.state.catalog = [...catalog];
        this.context.host.setAttribute("catalog-size", String(catalog.length));
        this.context.renderSync.syncStructureTreeCatalog();
    }

    setDataSources(sources: EditorDataSource[]): void {
        this.context.state.dataSources = sources.map((source) => ({
            ...source,
            fields: [...source.fields],
            ...(source.params ? { params: [...source.params] } : {}),
            ...(source.body
                ? {
                      body: {
                          ...source.body,
                          fields: [...source.body.fields],
                      },
                  }
                : {}),
        }));
        this.context.renderSync.syncStructureTreeDataSources();
    }

    setEditingPolicy(policy: EditorInteractionPolicy): void {
        this.context.state.editingPolicy = resolveEditorInteractionPolicy(policy);
        this.context.renderSync.syncStructureTreeEditingPolicy();
        if (this.context.state.runtime) {
            this.context.commands.renderStructure();
            this.context.commands.renderSettings();
        }
    }

    setPreviewMode(mode: EditorPreviewMode): void {
        this.context.state.previewMode = mode === "external" ? "external" : "mirrored";
        this.context.renderSync.syncBindingPreviewCore();
        this.context.renderSync.syncViewFrameContent();
    }

    setFrameUrls(urls: EditorFrameUrls): void {
        this.setFrameUrl("editor-frame-url", urls.editor);
        this.setFrameUrl("view-frame-url", urls.view);
    }

    reloadPreview(url?: string): void {
        if (url === undefined) {
            this.context.refs.canvas.reloadViewFrame();
            return;
        }
        const currentUrl = this.context.refs.canvas.getAttribute("view-frame-url");
        this.context.refs.canvas.setAttribute("view-frame-url", url);
        if (currentUrl === url) {
            this.context.refs.canvas.reloadViewFrame();
        }
    }

    setEditorMode(mode: TopBarEditorMode): void {
        this.context.state.editorMode = mode === "view" ? "view" : "edit";
        this.context.commands.syncEditorMode();
    }

    requestSave(): void {
        this.context.commands.saveDocument();
    }

    setPageConfig(config: EditorV2PageConfig): void {
        this.context.state.pageConfig = {
            ...config,
            tags: [...config.tags],
        };
        this.context.refs.topBar.setPageTitle(config.title, config.path);
        this.context.renderSync.syncPageSettingsForm();
    }

    loadDocument(document: EditorDocument, selectedTarget: HTMLElement | null = null): void {
        this.context.commands.exitAllStateSessions();
        this.context.commands.resetInlineTextEditing();
        this.context.state.runtime?.dispose();
        this.context.state.editorDocument = document;
        const runtime = new EditorRuntime(this.context.state.catalog, this.context.state.dataSources);
        this.context.state.runtime = runtime;
        runtime.load(document);
        this.context.commands.refreshInlineTextEditing();
        this.context.commands.renderStructure();
        this.context.commands.select(
            selectedTarget
                ? (runtime.getEditor(selectedTarget) ?? runtime.getClosestEditor(selectedTarget) ?? null)
                : null,
            { scrollStructureIntoView: true },
        );
    }

    private setFrameUrl(attribute: "editor-frame-url" | "view-frame-url", url: string | null | undefined): void {
        if (url === undefined) {
            return;
        }
        if (url === null) {
            this.context.refs.canvas.removeAttribute(attribute);
        } else {
            this.context.refs.canvas.setAttribute(attribute, url);
        }
    }
}
