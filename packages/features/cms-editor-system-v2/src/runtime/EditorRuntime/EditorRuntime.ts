import {
    CMS_BINDING_ATTRIBUTES,
    Editor,
    type DataScope,
    type EditorCatalog,
    type EditorCatalogEntry,
    type EditorDocument,
    type SettingSection,
} from "@bernouy/cms-content/editor";
import { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import type { EditorDataSource } from "../dataSources";
import { createRuntimeEditor } from "./createRuntimeEditor";
import { declareBindingDataScopes } from "./dataScopes";
import {
    buildRuntimeStructure,
    findClosestRuntimeEditor,
    findRichTextOwner,
    runtimeElements,
    type EditorRuntimeStructureContext,
} from "./structure";
import type { EditorRuntimeSelection, RuntimeManagedEditor, StructureNode } from "./types";

export class EditorRuntime {
    readonly registry = new EditorRegistry();

    private readonly _catalogByTag = new Map<string, EditorCatalogEntry>();
    private readonly _entriesByEditor = new Map<Editor, EditorCatalogEntry>();
    private readonly _editors: RuntimeManagedEditor[] = [];
    private _document: EditorDocument | null = null;
    private _selectedEditor: Editor | null = null;

    constructor(
        catalog: EditorCatalog,
        private readonly _dataSources: EditorDataSource[] = [],
    ) {
        for (const entry of catalog) {
            this._catalogByTag.set(entry.tag.toLowerCase(), entry);
        }
    }

    load(document: EditorDocument): void {
        this.dispose();
        this._assertDocument(document);
        this._document = document;

        for (const element of runtimeElements(document.root)) {
            const entry = this._catalogByTag.get(element.localName);
            if (!entry) {
                continue;
            }

            const editor = createRuntimeEditor(entry, element, this.registry);
            this._editors.push(editor);
            this._entriesByEditor.set(editor, entry);
        }

        this._connectManagedNativeEditors();

        for (const editor of this._editors) {
            editor.mount();
            declareBindingDataScopes(editor, this.registry, this._dataSources);
        }
    }

    dispose(): void {
        for (const editor of [...this._editors].reverse()) {
            editor.dispose();
        }
        this._editors.length = 0;
        this._entriesByEditor.clear();
        this._document = null;
        this._selectedEditor = null;
    }

    getEditor(target: HTMLElement): Editor | undefined {
        return this.registry.getEditor(target);
    }

    getClosestEditor(target: Element | null): Editor | undefined {
        return findClosestRuntimeEditor(this._structureContext(), target);
    }

    getStructure(): StructureNode[] {
        return buildRuntimeStructure(this._structureContext());
    }

    select(targetOrEditor: HTMLElement | Editor | null): EditorRuntimeSelection | null {
        if (!targetOrEditor) {
            this._selectedEditor = null;
            return null;
        }

        const editor = targetOrEditor instanceof Editor ? targetOrEditor : this.registry.getEditor(targetOrEditor);
        const selected = editor ? (findRichTextOwner(this._structureContext(), editor.target) ?? editor) : null;
        this._selectedEditor = selected ? this.registry.getLogicalEditor(selected) : null;

        return this.getSelection();
    }

    getSelection(): EditorRuntimeSelection | null {
        if (!this._selectedEditor) {
            return null;
        }

        return {
            editor: this._selectedEditor,
            settings: this._selectedEditor.getSettings(),
            contentSlots: this._selectedEditor.getContentSlots(),
            textCapability: this._selectedEditor.getTextCapability(),
            states: this._selectedEditor.getStates(),
        };
    }

    getSelectedSettings(): SettingSection[] {
        return this._selectedEditor?.getSettings() ?? [];
    }

    getSelectedDataScopes(): DataScope[] {
        if (!this._selectedEditor) {
            return [];
        }

        return this.registry.collectDataScopes(this._selectedEditor.target, {
            includeTarget: !this._selectedEditor.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source),
        });
    }

    private _structureContext(): EditorRuntimeStructureContext {
        return {
            document: this._requireDocument(),
            registry: this.registry,
            editors: this._editors,
            entriesByEditor: this._entriesByEditor,
        };
    }

    private _connectManagedNativeEditors(): void {
        for (const owner of this._editors) {
            const nativeElement = this._entriesByEditor.get(owner)?.nativeElement;
            if (!nativeElement) {
                continue;
            }
            const children = Array.from(owner.target.children);
            const managedElement = children[0] as HTMLElement | undefined;
            const hasAuthoredSiblingText = Array.from(owner.target.childNodes).some(
                (node) => node.nodeType === 3 && Boolean(node.textContent?.trim()),
            );
            if (
                children.length !== 1 ||
                managedElement?.localName !== nativeElement ||
                managedElement.hasAttribute("slot") ||
                hasAuthoredSiblingText
            ) {
                continue;
            }
            const managed = this.registry.getEditor(managedElement);
            if (!managed) {
                continue;
            }
            owner.setManagedNativeEditor(managed);
            this.registry.registerManagedNative(owner, managed);
        }
    }

    private _assertDocument(document: EditorDocument): void {
        if (document.root !== document.contentRoot && !document.root.contains(document.contentRoot)) {
            throw new Error("EditorDocument contentRoot must be inside root.");
        }
    }

    private _requireDocument(): EditorDocument {
        if (!this._document) {
            throw new Error("EditorRuntime has not loaded a document.");
        }

        return this._document;
    }
}
