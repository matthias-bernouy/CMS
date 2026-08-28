import "../TopBar/TopBar";
import "../Panel/Panel";
import "../StructureTree/StructureTree";
import "../Canvas/Canvas";
import "../../Settings/SettingsView/SettingsView";
import "../Pickers/RepeatPicker/RepeatPicker";
import type { EditorDocument } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "../../../runtime";
import { createShellControllerParts, type ShellControllerParts } from "./Controller/Core/Services/shellControllerParts";
import { connectShellController, disconnectShellController } from "./Controller/Core/Lifecycle/shellLifecycleFlow";
import { SHELL_OBSERVED_ATTRIBUTES } from "./Controller/Core/Lifecycle/shellAttributes";
import type { EditorV2PageConfig } from "./Controller/shellTypes";
import type { EditorFrameUrls, EditorPreviewMode } from "./Controller/shellTypes";
import type {
    EditorInsertableCatalogEntry,
    EditorInteractionPolicy,
    ResolvedEditorInteractionPolicy,
} from "../../../policy/editorInteractionPolicy";

export const EDITOR_V2_SAVE_DOCUMENT_EVENT = "editor-v2:save-document";
export const EDITOR_V2_DELETE_DOCUMENT_EVENT = "editor-v2:delete-document";

export class ShellController extends HTMLElement {
    static get observedAttributes(): string[] {
        return [...SHELL_OBSERVED_ATTRIBUTES];
    }

    private readonly _parts: ShellControllerParts;

    constructor() {
        super();
        this._parts = createShellControllerParts(this);
    }

    attributeChangedCallback(): void {
        this._parts.renderSync.syncChromeLabels();
    }

    connectedCallback(): void {
        connectShellController(this._parts.lifecycle);
    }

    disconnectedCallback(): void {
        disconnectShellController(this._parts.lifecycle);
    }

    get catalog(): EditorInsertableCatalogEntry[] {
        return this._parts.state.catalog;
    }

    set catalog(catalog: EditorInsertableCatalogEntry[]) {
        this.setCatalog(catalog);
    }

    setCatalog(catalog: EditorInsertableCatalogEntry[]): void {
        this._parts.api.setCatalog(catalog);
    }

    setDataSources(sources: EditorDataSource[]): void {
        this._parts.api.setDataSources(sources);
    }

    get editingPolicy(): ResolvedEditorInteractionPolicy {
        return { ...this._parts.state.editingPolicy };
    }

    set editingPolicy(policy: EditorInteractionPolicy) {
        this.setEditingPolicy(policy);
    }

    setEditingPolicy(policy: EditorInteractionPolicy): void {
        this._parts.api.setEditingPolicy(policy);
    }

    get previewMode(): EditorPreviewMode {
        return this._parts.state.previewMode;
    }

    set previewMode(mode: EditorPreviewMode) {
        this.setPreviewMode(mode);
    }

    setPreviewMode(mode: EditorPreviewMode): void {
        this._parts.api.setPreviewMode(mode);
    }

    setFrameUrls(urls: EditorFrameUrls): void {
        this._parts.api.setFrameUrls(urls);
    }

    reloadPreview(url?: string): void {
        this._parts.api.reloadPreview(url);
    }

    setEditorMode(mode: "edit" | "view"): void {
        this._parts.api.setEditorMode(mode);
    }

    requestSave(): void {
        this._parts.api.requestSave();
    }

    setPageConfig(config: EditorV2PageConfig): void {
        this._parts.api.setPageConfig(config);
    }

    setSaveStatus(label: string): void {
        this._parts.renderSync.setSaveStatus(label);
    }

    loadDocument(document: EditorDocument, selectedTarget: HTMLElement | null = null): void {
        this._parts.api.loadDocument(document, selectedTarget);
    }
}
