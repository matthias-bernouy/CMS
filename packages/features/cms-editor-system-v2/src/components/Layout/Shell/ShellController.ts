import "../TopBar/TopBar";
import "../Panel/Panel";
import "../StructureTree/StructureTree";
import "../Canvas/Canvas";
import "../../Settings/SettingsView/SettingsView";
import "../RepeatPicker/RepeatPicker";
import type { EditorCatalog, EditorDocument } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "../../../runtime";
import type { DefaultTemplateSelection } from "../StructureTree/StructureTree";
import type { BlockPickerItem } from "../BlockPickerModal/BlockPickerModal";
import {
    createShellControllerParts,
    type ShellControllerParts,
} from "./Controller/Core/Services/shellControllerParts";
import {
    connectShellController,
    disconnectShellController,
} from "./Controller/Core/Lifecycle/shellLifecycleFlow";
import { SHELL_OBSERVED_ATTRIBUTES } from "./Controller/Core/Lifecycle/shellAttributes";
import type {
    EditorV2PageConfig,
} from "./Controller/shellTypes";

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

    get catalog(): EditorCatalog {
        return this._parts.state.catalog;
    }

    set catalog(catalog: EditorCatalog) {
        this.setCatalog(catalog);
    }

    setCatalog(catalog: EditorCatalog): void {
        this._parts.api.setCatalog(catalog);
    }

    setInsertItems(items: BlockPickerItem[]): void {
        this._parts.api.setInsertItems(items);
    }

    setDefaultTemplateSelection(selection: DefaultTemplateSelection): void {
        this._parts.api.setDefaultTemplateSelection(selection);
    }

    setDataSources(sources: EditorDataSource[]): void {
        this._parts.api.setDataSources(sources);
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
