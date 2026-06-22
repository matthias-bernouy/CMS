import "../TopBar/TopBar";
import "../Panel/Panel";
import "../StructureTree/StructureTree";
import "../Canvas/Canvas";
import "../../Settings/SettingsView/SettingsView";
import "../RepeatPicker/RepeatPicker";
import {
    type CmsSourceStateForce,
    type EditorCatalog,
    type EditorDocument,
} from "@bernouy/cms-content/editor";
import {
    EditorRuntime,
    type EditorDataSource,
} from "../../../runtime";
import {
    type TopBarEditorMode,
    type TopBarViewport,
} from "../TopBar/TopBar";
import {
    type SettingsViewMode,
} from "../../Settings/SettingsView/SettingsView";
import type { DefaultTemplateSelection } from "../StructureTree/StructureTree";
import type { BlockPickerItem } from "../BlockPickerModal/BlockPickerModal";
import {
    createShellControllerParts,
    type ShellControllerParts,
} from "./Controller/Core/Services/shellControllerParts";
import type { ShellControllerInternals } from "./Controller/Core/Services/shellServiceTypes";
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

    private _catalog: EditorCatalog = [];
    private _dataSources: EditorDataSource[] = [];
    private _defaultTemplateSelection: DefaultTemplateSelection = {};
    private _insertItems: BlockPickerItem[] = [];
    private _runtime: EditorRuntime | null = null;
    private _editorDocument: EditorDocument | null = null;
    private _settingsMode: SettingsViewMode = "settings";
    private _viewport: TopBarViewport = "bleed";
    private _editorMode: TopBarEditorMode = "edit";
    private _sourceStateForce: CmsSourceStateForce = "loading";
    private _pageConfig: EditorV2PageConfig | null = null;
    private _chromeSyncPending: boolean = false;
    private readonly _parts: ShellControllerParts;

    constructor() {
        super();
        this._parts = createShellControllerParts(this as unknown as ShellControllerInternals);
    }

    attributeChangedCallback(): void {
        this._parts.renderSync.syncChromeLabels();
    }

    get _frameDocument(): Document | null {
        return this._parts.frames.frameDocument;
    }

    set _frameDocument(document: Document | null) {
        this._parts.frames.frameDocument = document;
    }

    get _viewFrameDocument(): Document | null {
        return this._parts.frames.viewFrameDocument;
    }

    set _viewFrameDocument(document: Document | null) {
        this._parts.frames.viewFrameDocument = document;
    }

    connectedCallback(): void {
        connectShellController(this._parts.lifecycle);
    }

    disconnectedCallback(): void {
        disconnectShellController(this._parts.lifecycle);
    }

    get catalog(): EditorCatalog {
        return this._catalog;
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
