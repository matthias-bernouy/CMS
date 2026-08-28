import type { Editor, EditorCatalog } from "@bernouy/cms-content/editor";
import type { EditorDataSource, EditorStructureNode, StructureNode } from "../../../../runtime";
import type { PendingPickerAction, StructureTreeKey } from "./structureTreeTypes";
import type { StructureDragDropState } from "../Actions/structureDragDrop";
import {
    resolveEditorInteractionPolicy,
    type ResolvedEditorInteractionPolicy,
} from "../../../../policy/editorInteractionPolicy";

export class StructureTreeState {
    nodes: StructureNode[] = [];
    rootNode: EditorStructureNode | null = null;
    selectedEditor: Editor | null = null;
    catalog: EditorCatalog = [];
    dataSources: EditorDataSource[] = [];
    editingPolicy: ResolvedEditorInteractionPolicy = resolveEditorInteractionPolicy();
    scrollSelectedIntoViewOnRender = false;
    restoreSelectedFocusOnRender = false;
    readonly repeatableTargets = new WeakSet<HTMLElement>();
    pendingPickerAction: PendingPickerAction | null = null;
    pendingSourceEditor: Editor | null = null;
    pendingConditionEditor: Editor | null = null;
    readonly dragDrop: StructureDragDropState = {
        draggedNode: null,
        dropRow: null,
    };
    readonly collapsedTargets = new Set<StructureTreeKey>();
    readonly expandedBadgeTargets = new Set<StructureTreeKey>();
    readonly renderedRows = new WeakMap<object, HTMLElement>();
    scrollRequestId = 0;
}
