import type { Editor, EditorCatalog } from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../../BlockPickerModal/BlockPickerModal";
import type { EditorDataSource, SourceStateName, StructureNode } from "../../../../runtime";
import type { PendingPickerAction, StructureTreeKey } from "./structureTreeTypes";
import type { DefaultTemplateSelection } from "../Pickers/structurePickerGroups";
import type { StructureDragDropState } from "../Actions/structureDragDrop";

export class StructureTreeState {
    nodes: StructureNode[] = [];
    selectedEditor: Editor | null = null;
    catalog: EditorCatalog = [];
    dataSources: EditorDataSource[] = [];
    defaultTemplateSelection: DefaultTemplateSelection = {};
    insertItems: BlockPickerItem[] = [];
    scrollSelectedIntoViewOnRender = false;
    readonly repeatableTargets = new WeakSet<HTMLElement>();
    pendingPickerAction: PendingPickerAction | null = null;
    pendingSourceEditor: Editor | null = null;
    readonly dragDrop: StructureDragDropState = {
        draggedNode: null,
        dropRow:     null,
    };
    readonly collapsedTargets = new Set<StructureTreeKey>();
    readonly expandedBadgeTargets = new Set<StructureTreeKey>();
    readonly sourceStateKeys = new WeakMap<HTMLElement, Map<SourceStateName, object>>();
    readonly renderedRows = new WeakMap<object, HTMLElement>();
    scrollRequestId = 0;
}
