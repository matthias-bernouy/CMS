import type { Editor, EditorCatalog } from "@bernouy/cms-content/editor";
import type { BlockPickerSlotGroup } from "../../../Pickers/BlockPickerModal/BlockPickerModal";
import type { EditorDataSource, EditorStructureNode, StructureNode } from "../../../../../runtime";
import type { PendingPickerAction, StructureTreeRenderOptions } from "../structureTreeTypes";
import { StructureTreeEmitter } from "./structureTreeEmitter";
import { StructureTreeEvents } from "./structureTreeEvents";
import { StructureTreeMenus } from "./structureTreeMenus";
import { StructureTreeNodes } from "./structureTreeNodes";
import { StructureTreePickers } from "./structureTreePickers";
import { StructureTreeRefs } from "./Support/structureTreeRefs";
import { StructureTreeRenderer } from "./structureTreeRenderer";
import { StructureTreeState } from "../structureTreeState";
import type { EditorInteractionPolicy } from "../../../../../policy/editorInteractionPolicy";
import { resolveEditorInteractionPolicy } from "../../../../../policy/editorInteractionPolicy";

export class StructureTreeController {
    readonly state: StructureTreeState;
    readonly refs: StructureTreeRefs;
    readonly emitter: StructureTreeEmitter;
    readonly nodes: StructureTreeNodes;
    readonly pickers: StructureTreePickers;
    readonly menus: StructureTreeMenus;
    readonly renderer: StructureTreeRenderer;
    readonly events: StructureTreeEvents;

    constructor(readonly host: HTMLElement) {
        this.state = new StructureTreeState();
        this.refs = new StructureTreeRefs(host);
        this.emitter = new StructureTreeEmitter(host, this.refs);
        this.nodes = new StructureTreeNodes(this.state);
        this.pickers = new StructureTreePickers(this);
        this.menus = new StructureTreeMenus(this);
        this.renderer = new StructureTreeRenderer(this);
        this.events = new StructureTreeEvents(this);
    }

    connect(): void {
        this.events.connect();
    }
    disconnect(): void {
        this.events.disconnect();
    }

    setCatalog(catalog: EditorCatalog): void {
        this.catalog = catalog;
    }
    setDataSources(sources: EditorDataSource[]): void {
        this.state.dataSources = sources.map((source) => ({ ...source, fields: [...source.fields] }));
    }
    setEditingPolicy(policy: EditorInteractionPolicy): void {
        this.state.editingPolicy = resolveEditorInteractionPolicy(policy);
        this.renderer.render();
    }

    get catalog(): EditorCatalog {
        return this.state.catalog;
    }
    set catalog(catalog: EditorCatalog) {
        this.state.catalog = [...catalog];
    }

    setStructure(
        nodes: StructureNode[],
        selectedEditor: Editor | null = null,
        catalog: EditorCatalog = this.state.catalog,
        options: StructureTreeRenderOptions = {},
    ): void {
        this.state.nodes = nodes;
        this.state.rootNode = options.rootNode ?? null;
        this.state.selectedEditor = selectedEditor;
        this.state.catalog = [...catalog];
        this.state.scrollSelectedIntoViewOnRender = options.scrollSelectedIntoView === true;
        if (this.state.scrollSelectedIntoViewOnRender) {
            this.nodes.expandPathToSelected();
        }
        this.nodes.setRepeatableTargets(options.repeatableTargets ?? []);
        this.renderer.render();
    }

    childGroups(node: EditorStructureNode): BlockPickerSlotGroup[] {
        return this.pickers.childGroups(node);
    }
    replaceGroups(node: EditorStructureNode): BlockPickerSlotGroup[] {
        return this.pickers.replaceGroups(node);
    }
    openPickerOrEmitSingleMedia(
        action: PendingPickerAction,
        groups: BlockPickerSlotGroup[],
        contextLabel: string,
    ): void {
        this.pickers.openPickerOrEmitSingleMedia(action, groups, contextLabel);
    }
    onDocumentKeydown(event: KeyboardEvent): void {
        this.events.onDocumentKeydown(event);
    }
    openSourcePicker(node: EditorStructureNode): void {
        this.pickers.openSourcePicker(node);
    }
    sourceActionLabel(node: EditorStructureNode): string {
        return this.menus.sourceActionLabel(node);
    }
}
