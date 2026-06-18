import {
    CMS_BINDING_ATTRIBUTES,
    CMS_SOURCE_STATES,
    Editor,
    type DataScope,
    type DataField,
    type EditorCatalog,
    type EditorCatalogEntry,
    type EditorDocument,
    type SettingSection,
    parseRepeat,
    parseSource,
    sourceStateFromElement,
} from "@bernouy/cms-content/editor";
import { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import { createRuntimeEditor } from "./createRuntimeEditor";
import type { EditorDataSource } from "../dataSources";
import type {
    EditorRuntimeSelection,
    EditorStructureNode,
    RuntimeManagedEditor,
    SourceStateName,
    SourceStateStructureNode,
    StructureNode,
} from "./types";

const SOURCE_STATE_NAMES: readonly SourceStateName[] = CMS_SOURCE_STATES;
const SOURCE_STATE_LABELS: Record<SourceStateName, string> = {
    loaded:  ":loaded",
    loading: ":loading",
    empty:   ":empty",
    error:   ":error",
};

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

        for (const element of this._walkElements(document.root)) {
            const entry = this._catalogByTag.get(element.localName);
            if (!entry) continue;

            const editor = createRuntimeEditor(entry, element, this.registry);
            this._editors.push(editor);
            this._entriesByEditor.set(editor, entry);
        }

        for (const editor of this._editors) {
            editor.mount();
            this._declareBindingDataScopes(editor);
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
        const document = this._requireDocument();
        if (!target || !document.contentRoot.contains(target)) return undefined;
        const closest = this.registry.getClosestEditor(target, document.contentRoot);
        if (!closest) return undefined;

        let current: HTMLElement | null = closest.target;
        while (current && document.contentRoot.contains(current)) {
            const editor = this.registry.getEditor(current);
            if (editor?.getStructureMode() === "opaque") return editor;
            if (current === document.contentRoot) break;
            current = current.parentElement;
        }

        return closest;
    }

    getStructure(): StructureNode[] {
        const document = this._requireDocument();

        return this._getStructureChildren(document.contentRoot);
    }

    select(targetOrEditor: HTMLElement | Editor | null): EditorRuntimeSelection | null {
        if (!targetOrEditor) {
            this._selectedEditor = null;
            return null;
        }

        const editor = targetOrEditor instanceof Editor
            ? targetOrEditor
            : this.registry.getEditor(targetOrEditor);

        this._selectedEditor = editor ?? null;

        return this.getSelection();
    }

    getSelection(): EditorRuntimeSelection | null {
        if (!this._selectedEditor) return null;

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
        if (!this._selectedEditor) return [];

        return this.registry.collectDataScopes(this._selectedEditor.target);
    }

    private _declareBindingDataScopes(editor: Editor): void {
        this._declareSourceDataScope(editor);
        this._declareRepeatDataScope(editor);
    }

    private _declareSourceDataScope(editor: Editor): void {
        const source = this._parseSourceBinding(editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "");
        if (!source) return;

        const dataSource = this._dataSources.find(candidate => candidate.url === this._sourceSchemaUrl(source.url));
        editor.declareDataScope({
            name: source.alias ?? "data",
            label: dataSource?.label ?? source.url,
            source: source.url,
            fields: dataSource?.fields ?? [],
        });
    }

    private _parseSourceBinding(value: string): { url: string; alias?: string } | null {
        const parsed = parseSource(value) as string | { url: string; alias?: string } | null;
        if (!parsed) return null;
        return typeof parsed === "string" ? { url: parsed } : parsed;
    }

    private _sourceSchemaUrl(url: string): string {
        return url.split("?")[0] ?? url;
    }

    private _declareRepeatDataScope(editor: Editor): void {
        const repeat = parseRepeat(editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.repeat) ?? "");
        if (!repeat?.alias) return;

        const field = this._findDataField(this.registry.collectDataScopes(editor.target), repeat.path);
        editor.declareDataScope({
            name: repeat.alias,
            label: repeat.alias,
            fields: field?.children ?? [],
        });
    }

    private _findDataField(scopes: DataScope[], path: string): DataField | undefined {
        for (const scope of scopes) {
            const field = this._findDataFieldInList(scope.fields, path)
                ?? this._findDataFieldInList(scope.fields, this._stripScopeName(scope.name, path));
            if (field) return field;
        }

        return undefined;
    }

    private _findDataFieldInList(fields: DataField[], path: string): DataField | undefined {
        for (const field of fields) {
            if (field.path === path) return field;
            const child = field.children ? this._findDataFieldInList(field.children, path) : undefined;
            if (child) return child;
        }

        return undefined;
    }

    private _stripScopeName(scopeName: string, path: string): string {
        const prefix = `${scopeName}.`;
        return path.startsWith(prefix) ? path.slice(prefix.length) : path;
    }

    private _getStructureChildren(parent: HTMLElement): StructureNode[] {
        const document = this._requireDocument();
        const children: EditorStructureNode[] = [];

        for (const editor of this._editors) {
            if (!document.contentRoot.contains(editor.target)) continue;
            if (editor.target === parent) continue;
            if (!parent.contains(editor.target)) continue;
            if (this._getClosestStructureParent(editor.target, parent) !== parent) continue;

            const entry = this._entriesByEditor.get(editor);
            if (!entry) continue;

            children.push({
                kind:     "editor",
                editor,
                target: editor.target,
                tag: entry.tag,
                label: entry.label,
                icon: entry.icon,
                badges: this._getStructureBadges(editor),
                children: editor.getStructureMode() === "opaque"
                    ? []
                    : this._getStructureChildren(editor.target),
            });
        }

        if (parent.hasAttribute(CMS_BINDING_ATTRIBUTES.source)) {
            return this._groupSourceChildren(this.registry.getEditor(parent), parent, children);
        }

        return children;
    }

    private _groupSourceChildren(
        sourceEditor: Editor | undefined,
        sourceTarget: HTMLElement,
        children: EditorStructureNode[],
    ): StructureNode[] {
        if (!sourceEditor) return children;

        return SOURCE_STATE_NAMES.map(state => {
            const stateChildren = children.filter(child => this._sourceStateOf(child.target) === state);
            return {
                kind: "source-state",
                sourceEditor,
                target: sourceTarget,
                state,
                label: SOURCE_STATE_LABELS[state],
                badges: [],
                children: stateChildren,
            } satisfies SourceStateStructureNode;
        });
    }

    private _sourceStateOf(target: HTMLElement): SourceStateName {
        return sourceStateFromElement(target);
    }

    private _getStructureBadges(editor: Editor): string[] {
        const badges: string[] = [];
        const slot = editor.target.getAttribute("slot");
        if (slot) badges.push(slot);
        if (editor.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source)) badges.push("Source");
        if (editor.target.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)) badges.push("Repeat");

        return badges;
    }

    private _getClosestStructureParent(target: HTMLElement, stopAt: HTMLElement): HTMLElement {
        const document = this._requireDocument();
        let current = target.parentElement;

        while (current && current !== stopAt) {
            if (document.contentRoot.contains(current)) {
                const editor = this.registry.getEditor(current);
                if (editor) return current;
            }
            current = current.parentElement;
        }

        return stopAt;
    }

    private _walkElements(root: HTMLElement): HTMLElement[] {
        return [
            root,
            ...Array.from(root.querySelectorAll<HTMLElement>("*")),
        ];
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
