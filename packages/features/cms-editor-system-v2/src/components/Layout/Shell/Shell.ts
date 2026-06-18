import "../TopBar/TopBar";
import "../Panel/Panel";
import "../StructureTree/StructureTree";
import "../Canvas/Canvas";
import "../../Settings/SettingsView/SettingsView";
import "../RepeatPicker/RepeatPicker";
import {
    asRepeat,
    asSource,
    applySourceState,
    type ContentSlot,
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    CMS_SNIPPET_TAG,
    type DataField,
    type DataScope,
    Editor,
    type EditableState,
    type EditableStateSession,
    type EditorCatalog,
    type EditorCatalogEntry,
    type EditorDocument,
    type MediaAccept,
    type Setting,
    type SettingSection,
    sourceStateFromElement,
} from "@bernouy/cms-content/editor";
import {
    EditorRuntime,
    type EditorStructureNode,
    type EditorDataSource,
    type SourceStateName,
    type StructureNode,
} from "../../../runtime";
import type { SettingsView } from "../../Settings/SettingsView/SettingsView";
import {
    CANVAS_BACKGROUND_CLICK_EVENT,
    CANVAS_FRAME_READY_EVENT,
    type Canvas,
    type CanvasFrameReadyDetail,
} from "../Canvas/Canvas";
import {
    TOPBAR_DELETE_EVENT,
    TOPBAR_EDITOR_MODE_CHANGE_EVENT,
    TOPBAR_PAGE_SETTINGS_EVENT,
    TOPBAR_SAVE_EVENT,
    TOPBAR_VIEWPORT_CHANGE_EVENT,
    type TopBar,
    type TopBarEditorMode,
    type TopBarEditorModeChangeDetail,
    type TopBarViewport,
    type TopBarViewportChangeDetail,
} from "../TopBar/TopBar";
import {
    SETTINGS_VIEW_CONTENT_CHANGE_EVENT,
    SETTINGS_VIEW_SETTING_CHANGE_EVENT,
    SETTINGS_VIEW_STATE_TOGGLE_EVENT,
    type SettingsViewContentChangeDetail,
    type SettingsViewMode,
    type SettingsViewSettingChangeDetail,
    type SettingsViewStateToggleDetail,
} from "../../Settings/SettingsView/SettingsView";
import type { StructureTree } from "../StructureTree/StructureTree";
import type { DefaultTemplateSelection, StructureTreeActionDetail } from "../StructureTree/StructureTree";
import {
    REPEAT_PICKER_SELECT_EVENT,
    RepeatPicker,
    type RepeatPickerSelectDetail,
} from "../RepeatPicker/RepeatPicker";
import type { BlockPickerItem } from "../BlockPickerModal/BlockPickerModal";
import {
    FilesCenter,
    type FilesCenterSelectManyDetail,
    type FilesCenterSelectDetail,
} from "../../Controls/FilesCenter/FilesCenter";
import { FrameHighlight } from "./FrameHighlight";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

type SourceBinding = {
    url: string;
    alias?: string;
    params?: Record<string, unknown>;
};

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

const VIEWPORTS: Record<TopBarViewport, { label: string; width: number | "100%"; height: number | "100%"; padding: "normal" | "none"; fit: "fixed" | "fluid" }> = {
    desktop: {
        label:  "Desktop",
        width:  1440,
        height: 900,
        padding: "normal",
        fit:    "fixed",
    },
    tablet: {
        label:  "Tablet",
        width:  768,
        height: 900,
        padding: "normal",
        fit:    "fixed",
    },
    mobile: {
        label:  "Mobile",
        width:  390,
        height: 844,
        padding: "normal",
        fit:    "fixed",
    },
    full: {
        label:  "Full",
        width:  "100%",
        height: "100%",
        padding: "normal",
        fit:    "fluid",
    },
    bleed: {
        label:  "Bleed",
        width:  "100%",
        height: "100%",
        padding: "none",
        fit:    "fluid",
    },
};

export type EditorV2PageConfig = {
    id: string;
    title: string;
    path: string;
    description: string;
    tags: string[];
    published: boolean;
    defaultTemplateCategory?: string;
};

export type EditorV2SaveDocumentDetail = {
    page: EditorV2PageConfig;
    content: string;
};

export const EDITOR_V2_SAVE_DOCUMENT_EVENT = "editor-v2:save-document";
export const EDITOR_V2_DELETE_DOCUMENT_EVENT = "editor-v2:delete-document";

type SelectOptions = {
    scrollFrameIntoView?: boolean;
    scrollStructureIntoView?: boolean;
};

export class Shell extends HTMLElement {
    static get observedAttributes(): string[] {
        return [
            "resource",
            "back-href",
            "back-label",
            "settings-label",
            "settings-title",
            "settings-description",
            "settings-path-label",
            "settings-tags-label",
            "settings-status-label",
            "settings-description-label",
        ];
    }

    private _catalog: EditorCatalog = [];
    private _dataSources: EditorDataSource[] = [];
    private _defaultTemplateSelection: DefaultTemplateSelection = {};
    private _insertItems: BlockPickerItem[] = [];
    private _runtime: EditorRuntime | null = null;
    private _frameDocument: Document | null = null;
    private _editorDocument: EditorDocument | null = null;
    private _settingsMode: SettingsViewMode = "settings";
    private _viewport: TopBarViewport = "bleed";
    private _editorMode: TopBarEditorMode = "edit";
    private _pageConfig: EditorV2PageConfig | null = null;
    private _clipboardElement: HTMLElement | null = null;
    private _chromeSyncPending: boolean = false;
    private readonly _stateSessions = new WeakMap<Editor, Map<string, EditableStateSession>>();
    private _pendingRepeatEditor: Editor | null = null;
    private readonly _highlight = new FrameHighlight();

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    attributeChangedCallback(): void {
        this._syncChromeLabels();
    }

    connectedCallback(): void {
        this._structureTree.addEventListener("editor-v2:select-editor", this._onSelectEditor);
        this._structureTree.addEventListener("editor-v2:structure-action", this._onStructureAction as EventListener);
        this._settings.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, this._onSettingChange as EventListener);
        this._settings.addEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, this._onContentChange as EventListener);
        this._settings.addEventListener(SETTINGS_VIEW_STATE_TOGGLE_EVENT, this._onStateToggle as EventListener);
        this._repeatPicker.addEventListener(REPEAT_PICKER_SELECT_EVENT, this._onRepeatSelect as EventListener);
        this._canvas.addEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady as EventListener);
        this._canvas.addEventListener(CANVAS_BACKGROUND_CLICK_EVENT, this._onCanvasBackgroundClick);
        this._topBar.addEventListener(TOPBAR_VIEWPORT_CHANGE_EVENT, this._onViewportChange as EventListener);
        this._topBar.addEventListener(TOPBAR_EDITOR_MODE_CHANGE_EVENT, this._onEditorModeChange as EventListener);
        this._topBar.addEventListener(TOPBAR_PAGE_SETTINGS_EVENT, this._onPageSettings);
        this._topBar.addEventListener(TOPBAR_SAVE_EVENT, this._onSave);
        this._topBar.addEventListener(TOPBAR_DELETE_EVENT, this._onDeleteDocument);
        this._pageSettingsModal.addEventListener("click", this._onPageSettingsModalClick);
        this.shadowRoot!.addEventListener("keydown", this._onKeyDown);
        this._settingsTabs.addEventListener("click", this._onSettingsTabsClick);
        this._syncStructureTreeCatalog();
        this._syncStructureTreeDataSources();
        this._syncViewport();
        this._syncEditorMode();
        this._syncChromeLabels();
    }

    disconnectedCallback(): void {
        this._structureTree.removeEventListener("editor-v2:select-editor", this._onSelectEditor);
        this._structureTree.removeEventListener("editor-v2:structure-action", this._onStructureAction as EventListener);
        this._settings.removeEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, this._onSettingChange as EventListener);
        this._settings.removeEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, this._onContentChange as EventListener);
        this._settings.removeEventListener(SETTINGS_VIEW_STATE_TOGGLE_EVENT, this._onStateToggle as EventListener);
        this._repeatPicker.removeEventListener(REPEAT_PICKER_SELECT_EVENT, this._onRepeatSelect as EventListener);
        this._canvas.removeEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady as EventListener);
        this._canvas.removeEventListener(CANVAS_BACKGROUND_CLICK_EVENT, this._onCanvasBackgroundClick);
        this._topBar.removeEventListener(TOPBAR_VIEWPORT_CHANGE_EVENT, this._onViewportChange as EventListener);
        this._topBar.removeEventListener(TOPBAR_EDITOR_MODE_CHANGE_EVENT, this._onEditorModeChange as EventListener);
        this._topBar.removeEventListener(TOPBAR_PAGE_SETTINGS_EVENT, this._onPageSettings);
        this._topBar.removeEventListener(TOPBAR_SAVE_EVENT, this._onSave);
        this._topBar.removeEventListener(TOPBAR_DELETE_EVENT, this._onDeleteDocument);
        this._pageSettingsModal.removeEventListener("click", this._onPageSettingsModalClick);
        this.shadowRoot!.removeEventListener("keydown", this._onKeyDown);
        this._settingsTabs.removeEventListener("click", this._onSettingsTabsClick);
        this._unbindFrameDocument();
        this._highlight.dispose();
        this._exitAllStateSessions();
        this._runtime?.dispose();
        this._runtime = null;
    }

    get catalog(): EditorCatalog {
        return this._catalog;
    }

    set catalog(catalog: EditorCatalog) {
        this.setCatalog(catalog);
    }

    setCatalog(catalog: EditorCatalog): void {
        this._catalog = [...catalog];
        this.setAttribute("catalog-size", String(this._catalog.length));
        this._syncStructureTreeCatalog();
    }

    setInsertItems(items: BlockPickerItem[]): void {
        this._insertItems = items.map(item => ({ ...item }));
        this._syncStructureTreeInsertItems();
        if (this._runtime) this._renderStructure();
    }

    setDefaultTemplateSelection(selection: DefaultTemplateSelection): void {
        this._defaultTemplateSelection = { ...selection };
        this._syncStructureTreeDefaultTemplateSelection();
    }

    setDataSources(sources: EditorDataSource[]): void {
        this._dataSources = sources.map(source => ({
            ...source,
            fields: [...source.fields],
        }));
        this._syncStructureTreeDataSources();
    }

    setPageConfig(config: EditorV2PageConfig): void {
        this._pageConfig = {
            ...config,
            tags: [...config.tags],
        };
        if (config.defaultTemplateCategory) {
            this.setDefaultTemplateSelection({
                category: config.defaultTemplateCategory,
            });
        }
        this._topBar.setPageTitle(config.title, config.path);
        this._syncPageSettingsForm();
    }

    setSaveStatus(label: string): void {
        this._setSaveStatus(label);
    }

    loadDocument(document: EditorDocument, selectedTarget: HTMLElement | null = null): void {
        this._exitAllStateSessions();
        this._runtime?.dispose();
        this._editorDocument = document;
        this._runtime = new EditorRuntime(this._catalog, this._dataSources);
        this._runtime.load(document);
        this._renderStructure();
        this._select(selectedTarget
            ? this._runtime.getEditor(selectedTarget) ?? this._runtime.getClosestEditor(selectedTarget) ?? null
            : null, { scrollStructureIntoView: true });
    }

    private readonly _onSelectEditor = (event: Event): void => {
        if (this._editorMode !== "edit") return;

        const editor = (event as CustomEvent<{ editor: Editor }>).detail.editor;
        this._select(editor, {
            scrollFrameIntoView:     true,
            scrollStructureIntoView: false,
        });
    };

    private readonly _onSettingsTabsClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-settings-mode]");
        if (!button) return;

        this._settingsMode = button.dataset.settingsMode === "overrides" ? "overrides" : "settings";
        this._syncSettingsTabs();
        this._renderSettings();
    };

    private readonly _onViewportChange = (event: CustomEvent<TopBarViewportChangeDetail>): void => {
        this._viewport = event.detail.viewport;
        this._syncViewport();
    };

    private readonly _onEditorModeChange = (event: CustomEvent<TopBarEditorModeChangeDetail>): void => {
        this._editorMode = event.detail.mode;
        this._syncEditorMode();
    };

    private readonly _onPageSettings = (): void => {
        this._openPageSettings();
    };

    private readonly _onSave = (): void => {
        this._applyPageSettingsForm();
        this._saveDocument();
    };

    private readonly _onDeleteDocument = (): void => {
        if (!this._pageConfig) {
            this._setSaveStatus("No page");
            return;
        }

        this.dispatchEvent(new CustomEvent(EDITOR_V2_DELETE_DOCUMENT_EVENT, {
            bubbles:  true,
            composed: true,
        }));
    };

    private _saveDocument(): void {
        if (!this._pageConfig) {
            this._setSaveStatus("No page");
            return;
        }

        this._setSaveStatus("Saving");
        this.dispatchEvent(new CustomEvent<EditorV2SaveDocumentDetail>(EDITOR_V2_SAVE_DOCUMENT_EVENT, {
            bubbles:  true,
            composed: true,
            detail:   {
                page:    {
                    ...this._pageConfig,
                    tags: [...this._pageConfig.tags],
                },
                content: this._getContentHtml(),
            },
        }));
    }

    private readonly _onPageSettingsModalClick = (event: Event): void => {
        const applyTarget = (event.target as Element | null)?.closest("[data-page-settings-apply]");
        if (applyTarget) {
            this._applyPageSettingsForm();
            this._closePageSettings();
            this._saveDocument();
            return;
        }

        const closeTarget = (event.target as Element | null)?.closest("[data-page-settings-close]");
        if (closeTarget) this._closePageSettings();
    };

    private readonly _onKeyDown = (event: Event): void => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Escape" && !this._pageSettingsModal.hidden) {
            this._closePageSettings();
        }
    };

    private readonly _onStructureAction = (event: CustomEvent<StructureTreeActionDetail>): void => {
        if (!this._runtime) return;
        if (this._editorMode !== "edit") return;

        const { action, editor, entry, item, sourceEditor, sourceState } = event.detail;
        if (action === "duplicate") {
            if (!editor) return;
            this._duplicateEditor(editor);
        } else if (action === "delete") {
            if (!editor) return;
            this._deleteEditor(editor);
        } else if (action === "copy") {
            if (!editor) return;
            this._copyEditor(editor);
        } else if (action === "paste-after") {
            this._pasteAfter(editor ?? null, sourceState);
        } else if (action === "set-source" && editor && event.detail.dataSource) {
            this._setSource(editor, event.detail.dataSource, event.detail.sourceBinding);
        } else if (action === "remove-source" && editor) {
            this._removeSource(editor);
        } else if (action === "configure-repeat" && editor) {
            this._openRepeatPicker(editor);
        } else if (action === "remove-repeat" && editor) {
            this._removeRepeat(editor);
        } else if (action === "clear-source-state" && editor && sourceState) {
            this._clearSourceState(editor, sourceState);
        } else if ((action === "move-before" || action === "move-after") && editor && sourceEditor) {
            this._moveEditor(sourceEditor, editor, action === "move-before" ? "before" : "after");
        } else if (action === "replace" && (item || entry)) {
            if (!editor) return;
            this._replaceEditor(editor, item ?? { kind: "block", entry: entry! }, event.detail.slot);
        } else if (action === "add-root" && (item || entry)) {
            this._addRoot(item ?? { kind: "block", entry: entry! });
        } else if (action === "add-source-state-child" && editor && (item || entry)) {
            if (!sourceState) return;
            this._addSourceStateChild(editor, item ?? { kind: "block", entry: entry! }, sourceState);
        } else if (item || entry) {
            if (!editor) return;
            this._addChild(editor, item ?? { kind: "block", entry: entry! }, event.detail.slot);
        }
    };

    private readonly _onFrameReady = (event: CustomEvent<CanvasFrameReadyDetail>): void => {
        const frameDocument = event.detail.document;
        this._bindFrameDocument(frameDocument);

        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")
            ?? frameDocument.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG);
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]");

        if (!root || !contentRoot) {
            this._runtime?.dispose();
            this._runtime = null;
            this._editorDocument = null;
            this._renderStructure();
            this._settings.setSettings([]);
            return;
        }

        this.loadDocument({
            root,
            contentRoot,
        });
    };

    private readonly _onSettingChange = (event: CustomEvent<SettingsViewSettingChangeDetail>): void => {
        if (!this._runtime) return;
        if (this._editorMode !== "edit") return;

        const selection = this._runtime.getSelection();
        if (!selection) return;

        this._applySetting(selection.editor, event.detail.setting, event.detail.value);
        this._highlight.show(selection.editor);
    };

    private readonly _onContentChange = (event: CustomEvent<SettingsViewContentChangeDetail>): void => {
        if (!this._runtime) return;
        if (this._editorMode !== "edit") return;

        const selection = this._runtime.getSelection();
        if (!selection?.textCapability) return;

        if (event.detail.format === "html") {
            selection.editor.target.innerHTML = event.detail.value;
        } else {
            selection.editor.target.textContent = event.detail.value;
        }
        this._highlight.show(selection.editor);
    };

    private readonly _onStateToggle = (event: CustomEvent<SettingsViewStateToggleDetail>): void => {
        if (!this._runtime) return;
        if (this._editorMode !== "edit") return;

        const selection = this._runtime.getSelection();
        if (!selection) return;

        this._toggleState(selection.editor, event.detail.state);
        this._renderSettings();
        this._highlight.show(selection.editor);
    };

    private readonly _onRepeatSelect = (event: CustomEvent<RepeatPickerSelectDetail>): void => {
        if (!this._pendingRepeatEditor) return;
        this._setRepeat(this._pendingRepeatEditor, event.detail.path, event.detail.alias);
        this._pendingRepeatEditor = null;
    };

    private readonly _onFrameClick = (event: Event): void => {
        if (!this._runtime) return;
        if (this._editorMode !== "edit") return;

        event.preventDefault();
        const target = this._eventElement(event);
        const editor = this._runtime.getClosestEditor(target);
        this._select(editor ?? null, { scrollStructureIntoView: true });
    };

    private readonly _onCanvasBackgroundClick = (): void => {
        if (!this._runtime) return;
        if (this._editorMode !== "edit") return;

        this._select(null, { scrollStructureIntoView: false });
    };

    private _select(editor: Editor | null, options: SelectOptions = {}): void {
        if (!this._runtime) return;

        const selection = this._runtime.select(editor);
        this._renderStructure(options);

        if (!selection) {
            this._settings.setSettings([]);
            this._highlight.hide();
            return;
        }

        this._renderSettings();
        this._highlight.show(selection.editor, {
            scrollIntoView: options.scrollFrameIntoView === true,
        });
    }

    private _renderSettings(): void {
        if (!this._runtime) return;

        const selection = this._runtime.getSelection();
        if (!selection) {
            this._settings.setSettings([]);
            return;
        }

        this._settings.setSettings(
            this._resolveSettingsValues(selection.editor, selection.settings),
            selection.textCapability,
            selection.textCapability ? this._getTextValue(selection.editor, selection.textCapability.format) : "",
            this._settingsMode,
            selection.states,
        );
    }

    private _applySetting(editor: Editor, setting: Setting, value: string | boolean): void {
        const attribute = setting.attribute;
        if (typeof value === "boolean") {
            editor.target.toggleAttribute(attribute, value);
            return;
        }

        if (value === "") {
            editor.target.removeAttribute(attribute);
            return;
        }

        if (typeof value !== "string") return;

        editor.target.setAttribute(attribute, value);
    }

    private _toggleState(editor: Editor, state: EditableState): void {
        const sessions = this._stateSessions.get(editor) ?? new Map<string, EditableStateSession>();

        if (sessions.has(state.id)) {
            this._exitStateSession(editor, state.id);
            return;
        }

        if (state.group) {
            for (const candidate of editor.getStates()) {
                if (candidate.id !== state.id && candidate.group === state.group) {
                    this._exitStateSession(editor, candidate.id);
                }
            }
        }

        const session = state.enter();
        sessions.set(state.id, session);
        this._stateSessions.set(editor, sessions);
    }

    private _exitStateSession(editor: Editor, stateId: string): void {
        const sessions = this._stateSessions.get(editor);
        const session = sessions?.get(stateId);
        if (!sessions || !session) return;

        session.exit();
        sessions.delete(stateId);
    }

    private _exitAllStateSessions(): void {
        if (!this._runtime) return;

        for (const node of this._flattenStructure(this._runtime.getStructure())) {
            if (this._isSourceStateNode(node)) continue;
            const sessions = this._stateSessions.get(node.editor);
            if (!sessions) continue;

            for (const session of sessions.values()) {
                session.exit();
            }
            sessions.clear();
        }
    }

    private _addChild(parent: Editor, item: BlockPickerItem, slotName?: string): void {
        const slot = this._findSlot(parent, slotName);
        if (!slot || this._isSlotFull(parent, slot)) return;

        if (item.kind === "media") {
            this._insertMedia(parent, item, slot, slotName);
            return;
        }

        const insertion = this._createInsertion(item, slotName);
        if (!insertion || !this._canInsertNodeCount(parent, slot, insertion.slotElements)) return;

        parent.target.append(insertion.fragment);
        this._reloadFrameDocument(insertion.selectionTarget);
    }

    private _addRoot(item: BlockPickerItem): void {
        if (!this._editorDocument || item.kind === "media") return;

        const insertion = this._createInsertion(item);
        if (!insertion) return;

        if (this._isEmptyDocumentContent()) {
            this._editorDocument.contentRoot.replaceChildren();
        }
        this._editorDocument.contentRoot.append(insertion.fragment);
        this._reloadFrameDocument(insertion.selectionTarget);
    }

    private _duplicateEditor(editor: Editor): void {
        if (!this._canDuplicate(editor)) return;

        const clone = editor.target.cloneNode(true) as HTMLElement;
        editor.target.after(clone);
        this._reloadFrameDocument(clone);
    }

    private _deleteEditor(editor: Editor): void {
        if (!this._canDelete(editor)) return;

        const nextSelectionTarget = this._findNextSelectionTargetAfterDelete(editor);
        editor.target.remove();
        this._reloadFrameDocument(nextSelectionTarget);
    }

    private _replaceEditor(editor: Editor, item: BlockPickerItem, slotName?: string): void {
        const parent = this._parentEditor(editor);
        if (!parent) {
            this._replaceRootEditor(editor, item);
            return;
        }

        const slot = this._findSlot(parent, slotName);
        if (!slot) return;
        const sourceState = this._sourceStateForSibling(editor);

        if (item.kind === "media") {
            this._replaceWithMedia(editor, parent, item, slot, slotName, sourceState);
            return;
        }

        const insertion = this._createInsertion(item, slotName, sourceState);
        if (!insertion || !this._canReplaceNodeCount(parent, editor, slot, insertion.slotElements)) return;

        editor.target.replaceWith(insertion.fragment);
        this._reloadFrameDocument(insertion.selectionTarget);
    }

    private _replaceRootEditor(editor: Editor, item: BlockPickerItem): void {
        if (item.kind === "media") return;

        const insertion = this._createInsertion(item);
        if (!insertion) return;

        editor.target.replaceWith(insertion.fragment);
        this._reloadFrameDocument(insertion.selectionTarget);
    }

    private _copyEditor(editor: Editor): void {
        this._clipboardElement = editor.target.cloneNode(true) as HTMLElement;
    }

    private _pasteAfter(editor: Editor | null, sourceState?: SourceStateName): void {
        if (!this._clipboardElement || !this._editorDocument) return;

        const clone = this._clipboardElement.cloneNode(true) as HTMLElement;
        if (!editor) {
            this._editorDocument.contentRoot.append(clone);
            this._reloadFrameDocument(clone);
            return;
        }

        if (sourceState) {
            this._applySourceState(clone, sourceState);
            editor.target.append(clone);
            this._reloadFrameDocument(clone);
            return;
        }

        if (!this._canInsertSibling(editor, clone)) return;

        editor.target.after(clone);
        this._reloadFrameDocument(clone);
    }

    private _addSourceStateChild(parent: Editor, item: BlockPickerItem, sourceState: SourceStateName): void {
        const slot = this._sourceStateSlot(parent, sourceState);
        if (!slot || this._isSlotFull(parent, slot)) return;

        if (item.kind === "media") {
            this._insertMedia(parent, item, slot, undefined, sourceState);
            return;
        }

        const insertion = this._createInsertion(item, undefined, sourceState);
        if (!insertion || !this._canInsertNodeCount(parent, slot, insertion.slotElements)) return;

        parent.target.append(insertion.fragment);
        this._reloadFrameDocument(insertion.selectionTarget);
    }

    private _sourceStateSlot(parent: Editor, sourceState: SourceStateName): ContentSlot {
        return {
            label: sourceState.slice(0, 1).toUpperCase() + sourceState.slice(1),
            accepts: [{ kind: "any-component" }],
        };
    }

    private _clearSourceState(parent: Editor, sourceState: SourceStateName): void {
        if (sourceState === "loaded") {
            for (const child of Array.from(parent.target.children)) {
                if (!child.hasAttribute(CMS_BINDING_ATTRIBUTES.slot)) child.remove();
            }
            this._reloadFrameDocument(parent.target);
            return;
        }

        for (const child of Array.from(parent.target.children)) {
            if (child.getAttribute(CMS_BINDING_ATTRIBUTES.slot) === sourceState) child.remove();
        }
        this._reloadFrameDocument(parent.target);
    }

    private _setSource(editor: Editor, source: EditorDataSource, binding: SourceBinding = { url: source.url }): void {
        editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.source, (asSource as (source: SourceBinding | string) => string)(binding));
        this._reloadFrameDocument(editor.target);
    }

    private _removeSource(editor: Editor): void {
        editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.source);
        this._reloadFrameDocument(editor.target);
    }

    private _openRepeatPicker(editor: Editor): void {
        if (!this._runtime) return;

        this._pendingRepeatEditor = editor;
        this._runtime.select(editor);
        this._repeatPicker.open(this._runtime.getSelectedDataScopes(), this._findStructureNodeLabel(editor) ?? editor.target.localName);
    }

    private _setRepeat(editor: Editor, path: string, alias: string): void {
        editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.repeat, asRepeat({ path, alias }));
        this._reloadFrameDocument(editor.target);
    }

    private _removeRepeat(editor: Editor): void {
        editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.repeat);
        this._reloadFrameDocument(editor.target);
    }

    private _moveEditor(source: Editor, target: Editor, position: "before" | "after"): void {
        if (source === target || source.target.contains(target.target)) return;
        if (!this._canMoveEditor(source, target)) return;

        this._applySlot(source.target, target.target.getAttribute("slot") ?? undefined);
        this._applySourceState(source.target, this._sourceStateForSibling(target));

        if (position === "before") {
            target.target.before(source.target);
        } else {
            target.target.after(source.target);
        }

        this._reloadFrameDocument(source.target);
    }

    private _createInsertion(item: BlockPickerItem, slotName?: string, sourceState?: SourceStateName): {
        fragment: DocumentFragment;
        selectionTarget: HTMLElement;
        slotElements: HTMLElement[];
    } | null {
        const document = this._frameDocument;
        if (!document) return null;
        if (item.kind === "media") return null;

        if (item.kind === "block") {
            const fragment = this._createBlockFragment(document, item.entry);
            const slotElements = Array.from(fragment.children).filter(this._isElementNode) as HTMLElement[];
            for (const child of slotElements) {
                this._applySlot(child, slotName);
                this._applySourceState(child, sourceState);
            }
            const selectionTarget = slotElements.find(child => child.tagName.toLowerCase() === item.entry.tag) ?? slotElements[0] ?? null;
            if (!selectionTarget) return null;
            return {
                fragment,
                selectionTarget,
                slotElements,
            };
        }

        if (item.kind === "snippet") {
            const snippet = document.createElement(CMS_SNIPPET_TAG);
            snippet.setAttribute("identifier", item.identifier);
            snippet.innerHTML = item.content;
            this._applySlot(snippet, slotName);
            this._applySourceState(snippet, sourceState);
            const fragment = document.createDocumentFragment();
            fragment.append(snippet);
            return {
                fragment,
                selectionTarget: snippet,
                slotElements: [snippet],
            };
        }

        const template = document.createElement("template");
        template.innerHTML = item.content;
        const fragment = template.content.cloneNode(true) as DocumentFragment;
        this._expandSnippetReferences(fragment);
        const slotElements = Array.from(fragment.children).filter(this._isElementNode) as HTMLElement[];
        for (const child of slotElements) {
            this._applySlot(child, slotName);
            this._applySourceState(child, sourceState);
        }

        const selectionTarget = slotElements[0] ?? null;
        if (!selectionTarget) return null;

        return {
            fragment,
            selectionTarget,
            slotElements,
        };
    }

    private _createBlockFragment(document: Document, entry: EditorCatalogEntry): DocumentFragment {
        if (!entry.defaultContent) {
            const fragment = document.createDocumentFragment();
            fragment.append(document.createElement(entry.tag));
            return fragment;
        }

        const template = document.createElement("template");
        template.innerHTML = entry.defaultContent;
        const fragment = template.content.cloneNode(true) as DocumentFragment;
        this._expandSnippetReferences(fragment);
        return fragment;
    }

    private _insertMedia(parent: Editor, item: Extract<BlockPickerItem, { kind: "media" }>, slot: ContentSlot, slotName?: string, sourceState?: SourceStateName): void {
        const remaining = this._remainingSlotCapacity(parent, slot);
        if (remaining <= 0) return;

        this._openMediaPicker(item.accept, {
            multiple:     remaining > 1,
            maxSelection: typeof slot.max === "number" ? remaining : undefined,
        }, (elements) => {
            if (elements.length === 0 || !this._canInsertNodeCount(parent, slot, elements)) return;
            for (const element of elements) {
                this._applySlot(element, slotName);
                this._applySourceState(element, sourceState);
            }
            parent.target.append(...elements);
            this._reloadFrameDocument(elements[0] ?? null);
        });
    }

    private _replaceWithMedia(editor: Editor, parent: Editor, item: Extract<BlockPickerItem, { kind: "media" }>, slot: ContentSlot, slotName?: string, sourceState?: SourceStateName): void {
        if (!this._canReplaceNodeCount(parent, editor, slot, [editor.target])) return;
        this._openMediaPicker(item.accept, {
            multiple: false,
        }, (elements) => {
            const element = elements[0];
            if (!element) return;
            this._applySlot(element, slotName);
            this._applySourceState(element, sourceState);
            editor.target.replaceWith(element);
            this._reloadFrameDocument(element);
        });
    }

    private _openMediaPicker(
        accept: MediaAccept[] | undefined,
        options: { multiple?: boolean; maxSelection?: number },
        onSelect: (elements: HTMLElement[]) => void,
    ): void {
        const center = new FilesCenter();
        const cleanup = () => center.remove();
        center.addEventListener("close", cleanup, { once: true });
        center.addEventListener("select-file", (event) => {
            const detail = (event as CustomEvent<FilesCenterSelectDetail>).detail;
            const element = this._createMediaElement(detail);
            if (!element) return;
            onSelect([element]);
        }, { once: true });
        center.addEventListener("select-files", (event) => {
            const detail = (event as CustomEvent<FilesCenterSelectManyDetail>).detail;
            const elements = detail.files
                .map(file => this._createMediaElement(file))
                .filter((element): element is HTMLElement => Boolean(element));
            onSelect(elements);
        }, { once: true });

        document.body.append(center);
        center.show({
            accept:       ["folder", "file"],
            fileAccept:   accept ?? ["image"],
            multiple:     options.multiple === true,
            maxSelection: options.maxSelection,
        });
    }

    private _createMediaElement(detail: FilesCenterSelectDetail): HTMLElement | null {
        const document = this._frameDocument;
        if (!document) return null;

        if (detail.mimeType?.startsWith("image/") ?? true) {
            const image = document.createElement("img");
            image.setAttribute("src", detail.src);
            image.setAttribute("alt", detail.label);
            image.addEventListener("load", () => {
                if (image.naturalWidth > 0) image.setAttribute("width", String(image.naturalWidth));
                if (image.naturalHeight > 0) image.setAttribute("height", String(image.naturalHeight));
            }, { once: true });
            return image;
        }

        if (detail.mimeType?.startsWith("video/")) {
            const video = document.createElement("video");
            video.setAttribute("src", detail.src);
            video.setAttribute("controls", "");
            return video;
        }

        if (detail.mimeType?.startsWith("audio/")) {
            const audio = document.createElement("audio");
            audio.setAttribute("src", detail.src);
            audio.setAttribute("controls", "");
            return audio;
        }

        const link = document.createElement("a");
        link.setAttribute("href", detail.src);
        link.textContent = detail.label;
        return link;
    }

    private _expandSnippetReferences(fragment: ParentNode): void {
        const snippets = this._insertItems.filter(item => item.kind === "snippet");
        if (snippets.length === 0) return;

        for (const element of Array.from(fragment.querySelectorAll(CMS_SNIPPET_TAG))) {
            const identifier = element.getAttribute("identifier");
            if (!identifier) continue;

            const snippet = snippets.find(item => item.identifier === identifier);
            if (!snippet) continue;

            element.innerHTML = snippet.content;
        }
    }

    private _isElementNode(node: Element): boolean {
        return node.nodeType === Node.ELEMENT_NODE;
    }

    private _canInsertNodeCount(parent: Editor, slot: ContentSlot, insertedElements: HTMLElement[]): boolean {
        if (typeof slot.max !== "number") return true;
        return this._slotChildCount(parent, slot) + insertedElements.length <= slot.max;
    }

    private _canReplaceNodeCount(parent: Editor, replaced: Editor, slot: ContentSlot, insertedElements: HTMLElement[]): boolean {
        if (typeof slot.max !== "number") return true;

        const replacedCount = (replaced.target.getAttribute("slot") ?? undefined) === (slot.slot ?? undefined) ? 1 : 0;
        return this._slotChildCount(parent, slot) - replacedCount + insertedElements.length <= slot.max;
    }

    private _findNextSelectionTargetAfterDelete(editor: Editor): HTMLElement | null {
        const parent = editor.target.parentElement;
        if (!parent || !this._runtime) return null;

        return this._runtime.getClosestEditor(parent)?.target ?? null;
    }

    private _canDuplicate(editor: Editor): boolean {
        const parent = this._parentEditor(editor);
        if (!parent) return true;

        const slot = this._findSlot(parent, editor.target.getAttribute("slot") ?? undefined);
        if (!slot) return true;

        return !this._isSlotFull(parent, slot);
    }

    private _canDelete(editor: Editor): boolean {
        const parent = this._parentEditor(editor);
        if (!parent) return true;

        const slot = this._findSlot(parent, editor.target.getAttribute("slot") ?? undefined);
        if (!slot?.min) return true;

        return this._slotChildCount(parent, slot) > slot.min;
    }

    private _canInsertSibling(reference: Editor, insertedElement: HTMLElement): boolean {
        const parent = this._parentEditor(reference);
        if (!parent) {
            this._applySlot(insertedElement, undefined);
            this._applySourceState(insertedElement, undefined);
            return true;
        }

        const slotName = reference.target.getAttribute("slot") ?? undefined;
        const slot = this._findSlot(parent, slotName);
        if (!slot || !this._canInsertNodeCount(parent, slot, [insertedElement])) return false;

        this._applySlot(insertedElement, slotName);
        this._applySourceState(insertedElement, this._sourceStateForSibling(reference));
        return true;
    }

    private _canMoveEditor(source: Editor, target: Editor): boolean {
        if (!this._canDelete(source)) return false;

        const targetParent = this._parentEditor(target);
        if (!targetParent) return true;

        const targetSlotName = target.target.getAttribute("slot") ?? undefined;
        const targetSlot = this._findSlot(targetParent, targetSlotName);
        if (!targetSlot) return false;

        const sourceParent = this._parentEditor(source);
        const isSameSlot = sourceParent === targetParent
            && (source.target.getAttribute("slot") ?? undefined) === targetSlotName;
        if (isSameSlot) return true;

        return this._canInsertNodeCount(targetParent, targetSlot, [source.target]);
    }

    private _isSlotFull(parent: Editor, slot: ContentSlot): boolean {
        return typeof slot.max === "number" && this._slotChildCount(parent, slot) >= slot.max;
    }

    private _findSlot(parent: Editor, slotName: string | undefined): ContentSlot | undefined {
        return parent.getContentSlots().find(slot => (slot.slot ?? undefined) === slotName);
    }

    private _slotChildCount(parent: Editor, slot: ContentSlot): number {
        return Array.from(parent.target.children)
            .filter(child => (child.getAttribute("slot") ?? undefined) === (slot.slot ?? undefined))
            .length;
    }

    private _remainingSlotCapacity(parent: Editor, slot: ContentSlot): number {
        if (typeof slot.max !== "number") return Number.MAX_SAFE_INTEGER;
        return Math.max(0, slot.max - this._slotChildCount(parent, slot));
    }

    private _parentEditor(editor: Editor): Editor | null {
        if (!this._runtime || !editor.target.parentElement) return null;
        return this._runtime.getClosestEditor(editor.target.parentElement)?.target === editor.target
            ? null
            : this._runtime.getClosestEditor(editor.target.parentElement) ?? null;
    }

    private _applySlot(element: HTMLElement, slotName: string | undefined): void {
        if (slotName) {
            element.setAttribute("slot", slotName);
        } else {
            element.removeAttribute("slot");
        }
    }

    private _applySourceState(element: HTMLElement, sourceState: SourceStateName | undefined): void {
        applySourceState(element, sourceState ?? "loaded");
    }

    private _sourceStateForSibling(reference: Editor): SourceStateName {
        return sourceStateFromElement(reference.target);
    }

    private _reloadFrameDocument(selectedTarget: HTMLElement | null = null): void {
        if (!this._frameDocument) return;

        const root = this._frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")
            ?? this._frameDocument.querySelector<HTMLElement>(CMS_BINDING_CORE_TAG);
        const contentRoot = this._frameDocument.querySelector<HTMLElement>("[data-cms-content]");

        if (!root || !contentRoot) return;

        this.loadDocument({ root, contentRoot }, selectedTarget);
    }

    private _resolveSettingsValues(editor: Editor, sections: SettingSection[]): SettingSection[] {
        return sections.map(section => ({
            ...section,
            settings: section.settings.map(setting => this._resolveSettingValue(editor, setting)),
        }));
    }

    private _resolveSettingValue(editor: Editor, setting: Setting): Setting {
        if (setting.type === "toggle") {
            return {
                ...setting,
                defaultValue: editor.target.hasAttribute(setting.attribute),
            };
        }

        return {
            ...setting,
            defaultValue: editor.target.getAttribute(setting.attribute) ?? setting.defaultValue,
        } as Setting;
    }

    private _getTextValue(editor: Editor, format: "text" | "richtext"): string {
        return format === "richtext"
            ? editor.target.innerHTML
            : editor.target.textContent ?? "";
    }

    private _bindFrameDocument(document: Document): void {
        this._unbindFrameDocument();
        this._frameDocument = document;
        document.addEventListener("click", this._onFrameClick, true);
    }

    private _unbindFrameDocument(): void {
        this._frameDocument?.removeEventListener("click", this._onFrameClick, true);
        this._frameDocument = null;
    }

    private _eventElement(event: Event): Element | null {
        const target = event.target;
        if (!target || !("nodeType" in target)) return null;
        if (target.nodeType === Node.ELEMENT_NODE) return target as Element;
        return (target as Node).parentElement;
    }

    private _renderStructure(options: SelectOptions = {}): void {
        if (!this._runtime || this._isEmptyDocumentContent()) {
            this._structureTree.setStructure([], null, this._catalog);
            return;
        }

        const structure = this._decorateStructure(this._runtime.getStructure());
        this._structureTree.setStructure(
            structure,
            this._runtime.getSelection()?.editor ?? null,
            this._catalog,
            {
                scrollSelectedIntoView: options.scrollStructureIntoView === true,
                repeatableTargets:      this._repeatableTargets(structure),
            },
        );
    }

    private _decorateStructure(nodes: StructureNode[]): StructureNode[] {
        return nodes.map(node => {
            if (this._isSourceStateNode(node)) {
                return {
                    ...node,
                    children: this._decorateEditorStructure(node.children),
                };
            }

            return this._decorateEditorStructureNode(node);
        });
    }

    private _decorateEditorStructure(nodes: EditorStructureNode[]): EditorStructureNode[] {
        return nodes.map(node => this._decorateEditorStructureNode(node));
    }

    private _decorateEditorStructureNode(node: EditorStructureNode): EditorStructureNode {
        const snippet = this._snippetStructureDetails(node);

        return {
            ...node,
            label:    snippet?.label ?? node.label,
            icon:     snippet?.icon ?? node.icon,
            children: this._decorateStructure(node.children),
        };
    }

    private _snippetStructureDetails(node: EditorStructureNode): { label: string; icon: string } | null {
        if (node.tag.toLowerCase() !== CMS_SNIPPET_TAG) return null;

        const identifier = node.target.getAttribute("identifier")?.trim() ?? "";
        const item = this._insertItems.find((candidate): candidate is Extract<BlockPickerItem, { kind: "snippet" }> =>
            candidate.kind === "snippet" && candidate.identifier === identifier);

        return {
            label: item?.label || identifier || node.label,
            icon:  item?.icon || "S",
        };
    }

    private _isEmptyDocumentContent(): boolean {
        const contentRoot = this._editorDocument?.contentRoot;
        if (!contentRoot) return true;

        const meaningfulNodes = Array.from(contentRoot.childNodes)
            .filter(node => node.nodeType !== Node.TEXT_NODE || (node.textContent ?? "").trim() !== "");
        if (meaningfulNodes.length === 0) return true;
        if (meaningfulNodes.length !== 1) return false;

        const node = meaningfulNodes[0];
        if (!node) return true;
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        const element = node as HTMLElement;
        if (element.tagName.toLowerCase() !== "p" || element.attributes.length > 0) return false;

        return Array.from(element.childNodes).every(child => {
            if (child.nodeType === Node.TEXT_NODE) return (child.textContent ?? "").trim() === "";
            return child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName.toLowerCase() === "br";
        });
    }

    private _repeatableTargets(nodes: StructureNode[]): HTMLElement[] {
        if (!this._runtime) return [];

        return this._flattenStructure(nodes)
            .filter((node): node is EditorStructureNode => !this._isSourceStateNode(node))
            .filter(node => this._hasArrayFields(this._runtime!.registry.collectDataScopes(node.target)))
            .map(node => node.target);
    }

    private _hasArrayFields(scopes: DataScope[]): boolean {
        return scopes.some(scope => this._fieldsContainArray(scope.fields));
    }

    private _fieldsContainArray(fields: DataField[]): boolean {
        return fields.some(field => field.type === "array" || this._fieldsContainArray(field.children ?? []));
    }

    private _syncStructureTreeDataSources(): void {
        const tree = this.shadowRoot!.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(tree)) {
            tree.setDataSources(this._dataSources);
            return;
        }

        customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
            const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
            if (this._isStructureTree(upgradedTree)) upgradedTree.setDataSources(this._dataSources);
        });
    }

    private _syncSettingsTabs(): void {
        for (const button of Array.from(this._settingsTabs.querySelectorAll<HTMLButtonElement>("[data-settings-mode]"))) {
            const isActive = button.dataset.settingsMode === this._settingsMode;
            button.classList.toggle("active", isActive);
            button.ariaPressed = String(isActive);
        }
    }

    private _syncViewport(): void {
        const viewport = VIEWPORTS[this._viewport];
        this._canvas.setAttribute("viewport-width", String(viewport.width));
        this._canvas.setAttribute("viewport-height", String(viewport.height));
        this._canvas.setAttribute("viewport-padding", viewport.padding);
        this._canvas.setAttribute("viewport-fit", viewport.fit);
        this._topBar.viewport = this._viewport;
    }

    private _syncEditorMode(): void {
        this._topBar.mode = this._editorMode;
        this.toggleAttribute("view-mode", this._editorMode === "view");

        if (this._editorMode === "view") {
            this._select(null);
        }
    }

    private _syncChromeLabels(): void {
        const resource = this.getAttribute("resource") ?? "page";
        const defaults = this._resourceChromeDefaults(resource);
        const topBar = this.shadowRoot!.querySelector("cms-editor-v2-topbar");

        if (!this._isTopBar(topBar)) {
            this._requestChromeSyncWhenTopBarIsReady();
            return;
        }

        this._applyChromeLabels(topBar, resource, defaults);
    }

    private _requestChromeSyncWhenTopBarIsReady(): void {
        if (this._chromeSyncPending) return;

        this._chromeSyncPending = true;
        customElements.whenDefined("cms-editor-v2-topbar").then(() => {
            this._chromeSyncPending = false;

            const topBar = this.shadowRoot?.querySelector("cms-editor-v2-topbar");
            if (topBar) customElements.upgrade(topBar);
            if (!this._isTopBar(topBar)) return;

            const resource = this.getAttribute("resource") ?? "page";
            this._applyChromeLabels(topBar, resource, this._resourceChromeDefaults(resource));
        });
    }

    private _applyChromeLabels(
        topBar: TopBar,
        resource: string,
        defaults: ReturnType<Shell["_resourceChromeDefaults"]>,
    ): void {
        topBar.setNavigation({
            backHref:      this.getAttribute("back-href") ?? defaults.backHref,
            backLabel:     this.getAttribute("back-label") ?? defaults.backLabel,
            settingsLabel: this.getAttribute("settings-label") ?? defaults.settingsLabel,
        });

        this.shadowRoot!.querySelector("#page-settings-title")!.textContent =
            this.getAttribute("settings-title") ?? defaults.settingsTitle;
        this.shadowRoot!.querySelector(".settings-description")!.textContent =
            this.getAttribute("settings-description") ?? defaults.settingsDescription;
        this.shadowRoot!.querySelector('[data-page-label="path"]')!.textContent =
            this.getAttribute("settings-path-label") ?? defaults.pathLabel;
        this.shadowRoot!.querySelector('[data-page-label="tags"]')!.textContent =
            this.getAttribute("settings-tags-label") ?? defaults.tagsLabel;
        this.shadowRoot!.querySelector('[data-page-label="published"]')!.textContent =
            this.getAttribute("settings-status-label") ?? defaults.statusLabel;
        this.shadowRoot!.querySelector('[data-page-label="description"]')!.textContent =
            this.getAttribute("settings-description-label") ?? defaults.descriptionLabel;

        const isPage = resource === "page";
        this._pageField<HTMLInputElement>("path").disabled = !isPage;
        this._pageField<HTMLSelectElement>("published").closest("label")!.hidden = !isPage;
    }

    private _resourceChromeDefaults(resource: string): {
        backHref: string;
        backLabel: string;
        settingsLabel: string;
        settingsTitle: string;
        settingsDescription: string;
        pathLabel: string;
        tagsLabel: string;
        statusLabel: string;
        descriptionLabel: string;
    } {
        if (resource === "template") {
            return {
                backHref:             "/admin/templates",
                backLabel:            "Templates",
                settingsLabel:        "Template settings",
                settingsTitle:        "Template settings",
                settingsDescription:  "Configure template metadata.",
                pathLabel:            "Identifier",
                tagsLabel:            "Category",
                statusLabel:          "Status",
                descriptionLabel:     "Description",
            };
        }

        if (resource === "snippet") {
            return {
                backHref:             "/admin/snippets",
                backLabel:            "Snippets",
                settingsLabel:        "Snippet settings",
                settingsTitle:        "Snippet settings",
                settingsDescription:  "Configure snippet metadata.",
                pathLabel:            "Identifier",
                tagsLabel:            "Category",
                statusLabel:          "Status",
                descriptionLabel:     "Description",
            };
        }

        return {
            backHref:             "/admin/pages",
            backLabel:            "Pages",
            settingsLabel:        "Page settings",
            settingsTitle:        "Page settings",
            settingsDescription:  "Configure page-level metadata and routing.",
            pathLabel:            "Path",
            tagsLabel:            "Tags",
            statusLabel:          "Status",
            descriptionLabel:     "SEO description",
        };
    }

    private _openPageSettings(): void {
        this._pageSettingsModal.hidden = false;
        const firstInput = this._pageSettingsModal.querySelector<HTMLInputElement>("input");
        firstInput?.focus();
    }

    private _closePageSettings(): void {
        this._pageSettingsModal.hidden = true;
    }

    private _syncPageSettingsForm(): void {
        if (!this._pageConfig) return;

        this._pageField<HTMLInputElement>("title").value = this._pageConfig.title;
        this._pageField<HTMLInputElement>("path").value = this._pageConfig.path;
        this._pageField<HTMLSelectElement>("published").value = String(this._pageConfig.published);
        this._pageField<HTMLTextAreaElement>("description").value = this._pageConfig.description;
        this._pageField<HTMLInputElement>("tags").value = this._pageConfig.tags.join(", ");
    }

    private _applyPageSettingsForm(): void {
        if (!this._pageConfig) return;

        this._pageConfig = {
            id:          this._pageConfig.id,
            title:       this._pageField<HTMLInputElement>("title").value.trim(),
            path:        this._pageField<HTMLInputElement>("path").value.trim(),
            published:   this._pageField<HTMLSelectElement>("published").value === "true",
            description: this._pageField<HTMLTextAreaElement>("description").value,
            tags:        this._parseTags(this._pageField<HTMLInputElement>("tags").value),
        };
        this._topBar.setPageTitle(this._pageConfig.title, this._pageConfig.path);
    }

    private _getContentHtml(): string {
        const content = this._frameDocument
            ?.querySelector<HTMLElement>("[data-cms-content]")
            ?.cloneNode(true) as HTMLElement | undefined;

        if (!content) return "";

        for (const snippet of Array.from(content.querySelectorAll(CMS_SNIPPET_TAG))) {
            snippet.replaceChildren();
        }

        return content.innerHTML;
    }

    private _parseTags(value: string): string[] {
        return [...new Set(value
            .split(",")
            .map(tag => tag.trim())
            .filter(Boolean))];
    }

    private _pageField<T extends HTMLElement>(name: string): T {
        return this.shadowRoot!.querySelector<T>(`[data-page-field="${name}"]`)!;
    }

    private _setSaveStatus(label: string): void {
        this._topBar.saveStatus = label;
    }

    private _syncStructureTreeCatalog(): void {
        const tree = this.shadowRoot!.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(tree)) {
            tree.catalog = this._catalog;
            tree.setInsertItems(this._insertItems);
            tree.setDefaultTemplateSelection(this._defaultTemplateSelection);
            return;
        }

        customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
            const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
            if (this._isStructureTree(upgradedTree)) {
                upgradedTree.catalog = this._catalog;
                upgradedTree.setInsertItems(this._insertItems);
                upgradedTree.setDefaultTemplateSelection(this._defaultTemplateSelection);
            }
        });
    }

    private _syncStructureTreeInsertItems(): void {
        const tree = this.shadowRoot!.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(tree)) {
            tree.setInsertItems(this._insertItems);
            tree.setDefaultTemplateSelection(this._defaultTemplateSelection);
            return;
        }

        customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
            const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
            if (this._isStructureTree(upgradedTree)) {
                upgradedTree.setInsertItems(this._insertItems);
                upgradedTree.setDefaultTemplateSelection(this._defaultTemplateSelection);
            }
        });
    }

    private _syncStructureTreeDefaultTemplateSelection(): void {
        const tree = this.shadowRoot!.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(tree)) {
            tree.setDefaultTemplateSelection(this._defaultTemplateSelection);
            return;
        }

        customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
            const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
            if (this._isStructureTree(upgradedTree)) {
                upgradedTree.setDefaultTemplateSelection(this._defaultTemplateSelection);
            }
        });
    }

    private _isStructureTree(value: Element | null | undefined): value is StructureTree {
        return Boolean(value && "catalog" in value && "setStructure" in value && "setInsertItems" in value && "setDefaultTemplateSelection" in value);
    }

    private _isTopBar(value: Element | null | undefined): value is TopBar {
        return Boolean(value && "setNavigation" in value);
    }

    private _findStructureNodeLabel(editor: Editor): string | null {
        const visit = (nodes: StructureNode[]): string | null => {
            for (const node of nodes) {
                if (!this._isSourceStateNode(node) && node.editor === editor) return node.label;
                const childLabel = visit(node.children);
                if (childLabel) return childLabel;
            }
            return null;
        };

        return this._runtime ? visit(this._runtime.getStructure()) : null;
    }

    private _flattenStructure(nodes: StructureNode[]): StructureNode[] {
        return nodes.flatMap(node => [
            node,
            ...this._flattenStructure(node.children),
        ]);
    }

    private _isSourceStateNode(node: StructureNode): node is Extract<StructureNode, { kind: "source-state" }> {
        return node.kind === "source-state";
    }

    private get _structureTree(): StructureTree {
        return this.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as StructureTree;
    }

    private get _settings(): SettingsView {
        return this.shadowRoot!.querySelector("cms-editor-v2-settings-view") as SettingsView;
    }

    private get _settingsTabs(): HTMLElement {
        return this.shadowRoot!.querySelector(".panel-tabs")!;
    }

    private get _canvas(): Canvas {
        return this.shadowRoot!.querySelector("cms-editor-v2-canvas") as Canvas;
    }

    private get _topBar(): TopBar {
        return this.shadowRoot!.querySelector("cms-editor-v2-topbar") as TopBar;
    }

    private get _repeatPicker(): RepeatPicker {
        let picker = this.shadowRoot!.querySelector<RepeatPicker>("cms-editor-v2-repeat-picker");
        if (!picker) {
            picker = new RepeatPicker();
            this.shadowRoot!.append(picker);
        }
        return picker;
    }

    private get _pageSettingsModal(): HTMLElement {
        return this.shadowRoot!.querySelector(".page-settings-modal")!;
    }

}

if (!customElements.get("cms-editor-shell")) {
    customElements.define("cms-editor-shell", Shell);
}
