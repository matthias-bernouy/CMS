import "../TopBar/TopBar";
import "../Panel/Panel";
import "../StructureTree/StructureTree";
import "../Canvas/Canvas";
import "../../Settings/SettingsView/SettingsView";
import {
    type ContentSlot,
    Editor,
    type EditableState,
    type EditableStateSession,
    type EditorCatalog,
    type EditorCatalogEntry,
    type EditorDocument,
    type MediaAccept,
    type Setting,
    type SettingSection,
    CMS_SNIPPET_TAG,
} from "@bernouy/cms-content/editor";
import {
    EditorRuntime,
    type EditorStructureNode,
} from "../../../runtime";
import type { SettingsView } from "../../Settings/SettingsView/SettingsView";
import {
    CANVAS_BACKGROUND_CLICK_EVENT,
    CANVAS_FRAME_READY_EVENT,
    type Canvas,
    type CanvasFrameReadyDetail,
} from "../Canvas/Canvas";
import {
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
import type { StructureTreeActionDetail } from "../StructureTree/StructureTree";
import type { BlockPickerItem } from "../BlockPickerModal/BlockPickerModal";
import {
    FilesCenter,
    type FilesCenterSelectManyDetail,
    type FilesCenterSelectDetail,
} from "../../Controls/FilesCenter/FilesCenter";
import { FrameHighlight } from "./FrameHighlight";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

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
};

export type EditorV2SaveDocumentDetail = {
    page: EditorV2PageConfig;
    content: string;
};

export const EDITOR_V2_SAVE_DOCUMENT_EVENT = "editor-v2:save-document";

type SelectOptions = {
    scrollStructureIntoView?: boolean;
};

export class Shell extends HTMLElement {

    private _catalog: EditorCatalog = [];
    private _insertItems: BlockPickerItem[] = [];
    private _runtime: EditorRuntime | null = null;
    private _frameDocument: Document | null = null;
    private _editorDocument: EditorDocument | null = null;
    private _settingsMode: SettingsViewMode = "settings";
    private _viewport: TopBarViewport = "desktop";
    private _editorMode: TopBarEditorMode = "edit";
    private _pageConfig: EditorV2PageConfig | null = null;
    private _clipboardElement: HTMLElement | null = null;
    private readonly _stateSessions = new WeakMap<Editor, Map<string, EditableStateSession>>();
    private readonly _highlight = new FrameHighlight();

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this._structureTree.addEventListener("editor-v2:select-editor", this._onSelectEditor);
        this._structureTree.addEventListener("editor-v2:structure-action", this._onStructureAction as EventListener);
        this._settings.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, this._onSettingChange as EventListener);
        this._settings.addEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, this._onContentChange as EventListener);
        this._settings.addEventListener(SETTINGS_VIEW_STATE_TOGGLE_EVENT, this._onStateToggle as EventListener);
        this._canvas.addEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady as EventListener);
        this._canvas.addEventListener(CANVAS_BACKGROUND_CLICK_EVENT, this._onCanvasBackgroundClick);
        this._topBar.addEventListener(TOPBAR_VIEWPORT_CHANGE_EVENT, this._onViewportChange as EventListener);
        this._topBar.addEventListener(TOPBAR_EDITOR_MODE_CHANGE_EVENT, this._onEditorModeChange as EventListener);
        this._topBar.addEventListener(TOPBAR_PAGE_SETTINGS_EVENT, this._onPageSettings);
        this._topBar.addEventListener(TOPBAR_SAVE_EVENT, this._onSave);
        this._pageSettingsModal.addEventListener("click", this._onPageSettingsModalClick);
        this.shadowRoot!.addEventListener("keydown", this._onKeyDown);
        this._settingsTabs.addEventListener("click", this._onSettingsTabsClick);
        this._syncStructureTreeCatalog();
        this._syncViewport();
        this._syncEditorMode();
    }

    disconnectedCallback(): void {
        this._structureTree.removeEventListener("editor-v2:select-editor", this._onSelectEditor);
        this._structureTree.removeEventListener("editor-v2:structure-action", this._onStructureAction as EventListener);
        this._settings.removeEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, this._onSettingChange as EventListener);
        this._settings.removeEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, this._onContentChange as EventListener);
        this._settings.removeEventListener(SETTINGS_VIEW_STATE_TOGGLE_EVENT, this._onStateToggle as EventListener);
        this._canvas.removeEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady as EventListener);
        this._canvas.removeEventListener(CANVAS_BACKGROUND_CLICK_EVENT, this._onCanvasBackgroundClick);
        this._topBar.removeEventListener(TOPBAR_VIEWPORT_CHANGE_EVENT, this._onViewportChange as EventListener);
        this._topBar.removeEventListener(TOPBAR_EDITOR_MODE_CHANGE_EVENT, this._onEditorModeChange as EventListener);
        this._topBar.removeEventListener(TOPBAR_PAGE_SETTINGS_EVENT, this._onPageSettings);
        this._topBar.removeEventListener(TOPBAR_SAVE_EVENT, this._onSave);
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
    }

    setPageConfig(config: EditorV2PageConfig): void {
        this._pageConfig = {
            ...config,
            tags: [...config.tags],
        };
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
        this._runtime = new EditorRuntime(this._catalog);
        this._runtime.load(document);
        this._renderStructure();
        this._select(selectedTarget
            ? this._runtime.getEditor(selectedTarget) ?? this._runtime.getClosestEditor(selectedTarget) ?? null
            : null, { scrollStructureIntoView: true });
    }

    private readonly _onSelectEditor = (event: Event): void => {
        if (this._editorMode !== "edit") return;

        const editor = (event as CustomEvent<{ editor: Editor }>).detail.editor;
        this._select(editor, { scrollStructureIntoView: false });
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

        const { action, editor, entry, item, sourceEditor } = event.detail;
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
            this._pasteAfter(editor ?? null);
        } else if ((action === "move-before" || action === "move-after") && editor && sourceEditor) {
            this._moveEditor(sourceEditor, editor, action === "move-before" ? "before" : "after");
        } else if (action === "replace" && (item || entry)) {
            if (!editor) return;
            this._replaceEditor(editor, item ?? { kind: "block", entry: entry! }, event.detail.slot);
        } else if (action === "add-root" && (item || entry)) {
            this._addRoot(item ?? { kind: "block", entry: entry! });
        } else if (item || entry) {
            if (!editor) return;
            this._addChild(editor, item ?? { kind: "block", entry: entry! }, event.detail.slot);
        }
    };

    private readonly _onFrameReady = (event: CustomEvent<CanvasFrameReadyDetail>): void => {
        const frameDocument = event.detail.document;
        this._bindFrameDocument(frameDocument);

        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")
            ?? frameDocument.querySelector<HTMLElement>("cms-binding-core");
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]");

        if (!root || !contentRoot) {
            this._runtime?.dispose();
            this._runtime = null;
            this._editorDocument = null;
            this._renderStructure();
            this._settings.setSettings([]);
            this._setSelectionStatus(null);
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
            this._setSelectionStatus(null);
            this._highlight.hide();
            return;
        }

        this._renderSettings();
        this._setSelectionStatus(selection.editor);
        this._highlight.show(selection.editor);
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

        if (item.kind === "media") {
            this._replaceWithMedia(editor, parent, item, slot, slotName);
            return;
        }

        const insertion = this._createInsertion(item, slotName);
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

    private _pasteAfter(editor: Editor | null): void {
        if (!this._clipboardElement || !this._editorDocument) return;

        const clone = this._clipboardElement.cloneNode(true) as HTMLElement;
        if (!editor) {
            this._editorDocument.contentRoot.append(clone);
            this._reloadFrameDocument(clone);
            return;
        }

        if (!this._canInsertSibling(editor, clone)) return;

        editor.target.after(clone);
        this._reloadFrameDocument(clone);
    }

    private _moveEditor(source: Editor, target: Editor, position: "before" | "after"): void {
        if (source === target || source.target.contains(target.target)) return;
        if (!this._canMoveEditor(source, target)) return;

        this._applySlot(source.target, target.target.getAttribute("slot") ?? undefined);

        if (position === "before") {
            target.target.before(source.target);
        } else {
            target.target.after(source.target);
        }

        this._reloadFrameDocument(source.target);
    }

    private _createInsertion(item: BlockPickerItem, slotName?: string): {
        fragment: DocumentFragment;
        selectionTarget: HTMLElement;
        slotElements: HTMLElement[];
    } | null {
        const document = this._frameDocument;
        if (!document) return null;
        if (item.kind === "media") return null;

        if (item.kind === "block") {
            const child = document.createElement(item.entry.tag);
            this._applySlot(child, slotName);
            const fragment = document.createDocumentFragment();
            fragment.append(child);
            return {
                fragment,
                selectionTarget: child,
                slotElements: [child],
            };
        }

        if (item.kind === "snippet") {
            const snippet = document.createElement(CMS_SNIPPET_TAG);
            snippet.setAttribute("identifier", item.identifier);
            snippet.innerHTML = item.content;
            this._applySlot(snippet, slotName);
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
        }

        const selectionTarget = slotElements[0] ?? null;
        if (!selectionTarget) return null;

        return {
            fragment,
            selectionTarget,
            slotElements,
        };
    }

    private _insertMedia(parent: Editor, item: Extract<BlockPickerItem, { kind: "media" }>, slot: ContentSlot, slotName?: string): void {
        const remaining = this._remainingSlotCapacity(parent, slot);
        if (remaining <= 0) return;

        this._openMediaPicker(item.accept, {
            multiple:     remaining > 1,
            maxSelection: typeof slot.max === "number" ? remaining : undefined,
        }, (elements) => {
            if (elements.length === 0 || !this._canInsertNodeCount(parent, slot, elements)) return;
            for (const element of elements) {
                this._applySlot(element, slotName);
            }
            parent.target.append(...elements);
            this._reloadFrameDocument(elements[0] ?? null);
        });
    }

    private _replaceWithMedia(editor: Editor, parent: Editor, item: Extract<BlockPickerItem, { kind: "media" }>, slot: ContentSlot, slotName?: string): void {
        if (!this._canReplaceNodeCount(parent, editor, slot, [editor.target])) return;
        this._openMediaPicker(item.accept, {
            multiple: false,
        }, (elements) => {
            const element = elements[0];
            if (!element) return;
            this._applySlot(element, slotName);
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

    private _expandSnippetReferences(fragment: DocumentFragment): void {
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
            return true;
        }

        const slotName = reference.target.getAttribute("slot") ?? undefined;
        const slot = this._findSlot(parent, slotName);
        if (!slot || !this._canInsertNodeCount(parent, slot, [insertedElement])) return false;

        this._applySlot(insertedElement, slotName);
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

    private _reloadFrameDocument(selectedTarget: HTMLElement | null = null): void {
        if (!this._frameDocument) return;

        const root = this._frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")
            ?? this._frameDocument.querySelector<HTMLElement>("cms-binding-core");
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
        if (!this._runtime) {
            this._structureTree.setStructure([], null, this._catalog);
            return;
        }

        const structure = this._runtime.getStructure();
        this._structureTree.setStructure(
            structure,
            this._runtime.getSelection()?.editor ?? null,
            this._catalog,
            { scrollSelectedIntoView: options.scrollStructureIntoView === true },
        );
    }

    private _setSelectionStatus(editor: Editor | null): void {
        this.shadowRoot!.querySelector(".selection-status")!.textContent = editor
            ? `Selected ${this._findStructureNodeLabel(editor) ?? editor.target.localName}`
            : "No selection";
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
        this.shadowRoot!.querySelector(".viewport-status")!.textContent = viewport.label;
    }

    private _syncEditorMode(): void {
        this._topBar.mode = this._editorMode;
        this.toggleAttribute("view-mode", this._editorMode === "view");
        this.shadowRoot!.querySelector(".mode-status")!.textContent = this._editorMode === "edit" ? "Edit" : "View";

        if (this._editorMode === "view") {
            this._select(null);
        }
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
            return;
        }

        customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
            const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
            if (this._isStructureTree(upgradedTree)) {
                upgradedTree.catalog = this._catalog;
                upgradedTree.setInsertItems(this._insertItems);
            }
        });
    }

    private _syncStructureTreeInsertItems(): void {
        const tree = this.shadowRoot!.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(tree)) {
            tree.setInsertItems(this._insertItems);
            return;
        }

        customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
            const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
            if (this._isStructureTree(upgradedTree)) {
                upgradedTree.setInsertItems(this._insertItems);
            }
        });
    }

    private _isStructureTree(value: Element | null | undefined): value is StructureTree {
        return Boolean(value && "catalog" in value && "setStructure" in value && "setInsertItems" in value);
    }

    private _findStructureNodeLabel(editor: Editor): string | null {
        const visit = (nodes: EditorStructureNode[]): string | null => {
            for (const node of nodes) {
                if (node.editor === editor) return node.label;
                const childLabel = visit(node.children);
                if (childLabel) return childLabel;
            }
            return null;
        };

        return this._runtime ? visit(this._runtime.getStructure()) : null;
    }

    private _flattenStructure(nodes: EditorStructureNode[]): EditorStructureNode[] {
        return nodes.flatMap(node => [
            node,
            ...this._flattenStructure(node.children),
        ]);
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

    private get _pageSettingsModal(): HTMLElement {
        return this.shadowRoot!.querySelector(".page-settings-modal")!;
    }

}

if (!customElements.get("cms-editor-v2-shell")) {
    customElements.define("cms-editor-v2-shell", Shell);
}
