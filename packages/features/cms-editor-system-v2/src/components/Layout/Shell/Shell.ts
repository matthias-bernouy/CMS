import "../TopBar/TopBar";
import "../Panel/Panel";
import "../StructureTree/StructureTree";
import "../Canvas/Canvas";
import "../../Settings/SettingsView/SettingsView";
import {
    type ContentSlot,
    Editor,
    type EditorCatalog,
    type EditorCatalogEntry,
    type EditorDocument,
    type Setting,
    type SettingSection,
} from "@bernouy/cms-content/editor";
import {
    EditorRuntime,
    type EditorStructureNode,
} from "../../../runtime";
import type { SettingsView } from "../../Settings/SettingsView/SettingsView";
import {
    CANVAS_FRAME_READY_EVENT,
    type Canvas,
    type CanvasFrameReadyDetail,
} from "../Canvas/Canvas";
import {
    SETTINGS_VIEW_CONTENT_CHANGE_EVENT,
    SETTINGS_VIEW_SETTING_CHANGE_EVENT,
    type SettingsViewContentChangeDetail,
    type SettingsViewSettingChangeDetail,
} from "../../Settings/SettingsView/SettingsView";
import type { StructureTree } from "../StructureTree/StructureTree";
import type { StructureTreeActionDetail } from "../StructureTree/StructureTree";
import { FrameHighlight } from "./FrameHighlight";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class Shell extends HTMLElement {

    private _catalog: EditorCatalog = [];
    private _runtime: EditorRuntime | null = null;
    private _frameDocument: Document | null = null;
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
        this._canvas.addEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady as EventListener);
        this._syncStructureTreeCatalog();
    }

    disconnectedCallback(): void {
        this._structureTree.removeEventListener("editor-v2:select-editor", this._onSelectEditor);
        this._structureTree.removeEventListener("editor-v2:structure-action", this._onStructureAction as EventListener);
        this._settings.removeEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, this._onSettingChange as EventListener);
        this._settings.removeEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, this._onContentChange as EventListener);
        this._canvas.removeEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady as EventListener);
        this._unbindFrameDocument();
        this._highlight.dispose();
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

    loadDocument(document: EditorDocument, selectedTarget: HTMLElement | null = null): void {
        this._runtime?.dispose();
        this._runtime = new EditorRuntime(this._catalog);
        this._runtime.load(document);
        this._renderStructure();
        this._select(selectedTarget
            ? this._runtime.getEditor(selectedTarget) ?? this._runtime.getClosestEditor(selectedTarget) ?? null
            : null);
    }

    private readonly _onSelectEditor = (event: Event): void => {
        const editor = (event as CustomEvent<{ editor: Editor }>).detail.editor;
        this._select(editor);
    };

    private readonly _onStructureAction = (event: CustomEvent<StructureTreeActionDetail>): void => {
        if (!this._runtime) return;

        const { action, editor, entry } = event.detail;
        if (action === "duplicate") {
            this._duplicateEditor(editor);
        } else if (action === "delete") {
            this._deleteEditor(editor);
        } else if (action === "replace" && entry) {
            this._replaceEditor(editor, entry, event.detail.slot);
        } else if (entry) {
            this._addChild(editor, entry, event.detail.slot);
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
        const selection = this._runtime.getSelection();
        if (!selection) return;

        this._applySetting(selection.editor, event.detail.setting.attribute, event.detail.value);
        this._highlight.show(selection.editor);
    };

    private readonly _onContentChange = (event: CustomEvent<SettingsViewContentChangeDetail>): void => {
        if (!this._runtime) return;
        const selection = this._runtime.getSelection();
        if (!selection?.textCapability) return;

        if (event.detail.format === "html") {
            selection.editor.target.innerHTML = event.detail.value;
        } else {
            selection.editor.target.textContent = event.detail.value;
        }
        this._highlight.show(selection.editor);
    };

    private readonly _onFrameClick = (event: Event): void => {
        if (!this._runtime) return;

        event.preventDefault();
        const target = this._eventElement(event);
        const editor = this._runtime.getClosestEditor(target);
        this._select(editor ?? null);
    };

    private _select(editor: Editor | null): void {
        if (!this._runtime) return;

        const selection = this._runtime.select(editor);
        this._renderStructure();

        if (!selection) {
            this._settings.setSettings([]);
            this._setSelectionStatus(null);
            this._highlight.hide();
            return;
        }

        this._settings.setSettings(
            this._resolveSettingsValues(selection.editor, selection.settings),
            this._runtime.getSelectedDataScopes(),
            selection.textCapability,
            selection.textCapability ? this._getTextValue(selection.editor, selection.textCapability.format) : "",
        );
        this._setSelectionStatus(selection.editor);
        this._highlight.show(selection.editor);
    }

    private _applySetting(editor: Editor, attribute: string, value: string | boolean): void {
        if (typeof value === "boolean") {
            editor.target.toggleAttribute(attribute, value);
            return;
        }

        if (value === "") {
            editor.target.removeAttribute(attribute);
            return;
        }

        editor.target.setAttribute(attribute, value);
    }

    private _addChild(parent: Editor, entry: EditorCatalogEntry, slotName?: string): void {
        const slot = this._findSlot(parent, slotName);
        if (!slot || this._isSlotFull(parent, slot)) return;

        const child = parent.target.ownerDocument.createElement(entry.tag);
        this._applySlot(child, slotName);
        parent.target.append(child);
        this._reloadFrameDocument(child);
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

    private _replaceEditor(editor: Editor, entry: EditorCatalogEntry, slotName?: string): void {
        const parent = this._parentEditor(editor);
        if (!parent) return;

        const slot = this._findSlot(parent, slotName);
        if (!slot) return;

        const replacement = editor.target.ownerDocument.createElement(entry.tag);
        this._applySlot(replacement, slotName);
        editor.target.replaceWith(replacement);
        this._reloadFrameDocument(replacement);
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

    private _renderStructure(): void {
        if (!this._runtime) {
            this._structureTree.setStructure([], null, this._catalog);
            return;
        }

        const structure = this._runtime.getStructure();
        this._structureTree.setStructure(structure, this._runtime.getSelection()?.editor ?? null, this._catalog);
    }

    private _setSelectionStatus(editor: Editor | null): void {
        this.shadowRoot!.querySelector(".selection-status")!.textContent = editor
            ? `Selected ${this._findStructureNodeLabel(editor) ?? editor.target.localName}`
            : "No selection";
    }

    private _syncStructureTreeCatalog(): void {
        const tree = this.shadowRoot!.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(tree)) {
            tree.catalog = this._catalog;
            return;
        }

        customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
            const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
            if (this._isStructureTree(upgradedTree)) {
                upgradedTree.catalog = this._catalog;
            }
        });
    }

    private _isStructureTree(value: Element | null | undefined): value is StructureTree {
        return Boolean(value && "catalog" in value && "setStructure" in value);
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

    private get _structureTree(): StructureTree {
        return this.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as StructureTree;
    }

    private get _settings(): SettingsView {
        return this.shadowRoot!.querySelector("cms-editor-v2-settings-view") as SettingsView;
    }

    private get _canvas(): Canvas {
        return this.shadowRoot!.querySelector("cms-editor-v2-canvas") as Canvas;
    }

}

if (!customElements.get("cms-editor-v2-shell")) {
    customElements.define("cms-editor-v2-shell", Shell);
}
