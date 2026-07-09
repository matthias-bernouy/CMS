import {
    BLOCK_PICKER_SELECT_EVENT,
    type BlockPickerSelectDetail,
} from "../../../BlockPickerModal/BlockPickerModal";
import {
    DATA_SOURCE_PICKER_REMOVE_EVENT,
    DATA_SOURCE_PICKER_SELECT_EVENT,
    type DataSourcePickerSelectDetail,
} from "../../../DataSourcePicker/DataSourcePicker";
import {
    CONDITION_PICKER_APPLY_EVENT,
    CONDITION_PICKER_REMOVE_EVENT,
    type ConditionPickerApplyDetail,
} from "../../../ConditionPicker/ConditionPicker";
import type { EditorStructureNode } from "../../../../../runtime";
import {
    clearStructureDragState,
    clearStructureDropRow,
    onStructureDragOver,
    onStructureDragStart,
    onStructureDrop,
} from "../../Actions/structureDragDrop";
import { onStructureDocumentKeydown } from "../../Actions/structureKeyboard";
import type { StructureTreeController } from "./structureTreeController";

export class StructureTreeEvents {
    readonly onBlockPickerSelect = (event: CustomEvent<BlockPickerSelectDetail>): void => {
        if (!this.tree.state.pendingPickerAction) return;
        const { action, editor } = this.tree.state.pendingPickerAction;
        this.tree.emitter.emitAction(action, editor, event.detail.option.item, event.detail.option.slot);
        this.tree.state.pendingPickerAction = null;
    };

    readonly onDataSourceSelect = (event: CustomEvent<DataSourcePickerSelectDetail>): void => {
        if (!this.tree.state.pendingSourceEditor) return;
        this.tree.emitter.emitAction("set-source", this.tree.state.pendingSourceEditor, undefined, undefined, undefined, undefined, event.detail.source, event.detail.binding);
        this.tree.state.pendingSourceEditor = null;
    };

    readonly onDataSourceRemove = (): void => {
        if (!this.tree.state.pendingSourceEditor) return;
        this.tree.emitter.emitAction("remove-source", this.tree.state.pendingSourceEditor);
        this.tree.state.pendingSourceEditor = null;
    };

    readonly onConditionApply = (event: CustomEvent<ConditionPickerApplyDetail>): void => {
        if (!this.tree.state.pendingConditionEditor) return;
        if (event.detail.expression) {
            this.tree.emitter.emitAction("set-condition", this.tree.state.pendingConditionEditor, undefined, undefined, undefined, undefined, undefined, undefined, undefined, event.detail.expression);
        } else {
            this.tree.emitter.emitAction("set-source-status-conditions", this.tree.state.pendingConditionEditor, undefined, undefined, undefined, undefined, undefined, undefined, event.detail.conditions);
        }
        this.tree.state.pendingConditionEditor = null;
    };

    readonly onConditionRemove = (): void => {
        if (!this.tree.state.pendingConditionEditor) return;
        this.tree.emitter.emitAction("remove-source-status-condition", this.tree.state.pendingConditionEditor);
        this.tree.state.pendingConditionEditor = null;
    };

    readonly onDocumentKeydown = (event: KeyboardEvent): void => {
        onStructureDocumentKeydown(event, {
            closeContextMenu: () => this.tree.emitter.closeContextMenu(),
            emitCopy:         editor => this.tree.emitter.emitAction("copy", editor),
            emitDelete:       editor => this.tree.emitter.emitAction("delete", editor),
            emitPaste:        editor => this.tree.emitter.emitAction("paste-after", editor),
            selectedEditor:   this.tree.state.selectedEditor,
        });
    };

    private readonly onDocumentClick = (): void => {
        this.tree.emitter.closeContextMenu();
    };

    constructor(private readonly tree: StructureTreeController) {}

    connect(): void {
        this.tree.host.ownerDocument.addEventListener("click", this.onDocumentClick);
        this.tree.host.ownerDocument.addEventListener("keydown", this.onDocumentKeydown);
        this.tree.refs.blockPicker.addEventListener(BLOCK_PICKER_SELECT_EVENT, this.onBlockPickerSelect as EventListener);
        this.tree.refs.dataSourcePicker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this.onDataSourceSelect as EventListener);
        this.tree.refs.dataSourcePicker.addEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this.onDataSourceRemove);
        this.tree.refs.conditionPicker.addEventListener(CONDITION_PICKER_APPLY_EVENT, this.onConditionApply as EventListener);
        this.tree.refs.conditionPicker.addEventListener(CONDITION_PICKER_REMOVE_EVENT, this.onConditionRemove);
        this.tree.refs.tree.addEventListener("click", this.onTreeClick);
        this.tree.refs.tree.addEventListener("contextmenu", this.onTreeContextMenu);
    }

    disconnect(): void {
        this.tree.host.ownerDocument.removeEventListener("click", this.onDocumentClick);
        this.tree.host.ownerDocument.removeEventListener("keydown", this.onDocumentKeydown);
        this.tree.refs.blockPicker.removeEventListener(BLOCK_PICKER_SELECT_EVENT, this.onBlockPickerSelect as EventListener);
        this.tree.refs.dataSourcePicker.removeEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this.onDataSourceSelect as EventListener);
        this.tree.refs.dataSourcePicker.removeEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this.onDataSourceRemove);
        this.tree.refs.conditionPicker.removeEventListener(CONDITION_PICKER_APPLY_EVENT, this.onConditionApply as EventListener);
        this.tree.refs.conditionPicker.removeEventListener(CONDITION_PICKER_REMOVE_EVENT, this.onConditionRemove);
        this.tree.refs.tree.removeEventListener("click", this.onTreeClick);
        this.tree.refs.tree.removeEventListener("contextmenu", this.onTreeContextMenu);
    }

    onDragStart(node: EditorStructureNode, event: DragEvent): void {
        onStructureDragStart(this.tree.state.dragDrop, node, event);
    }

    onDragOver(node: EditorStructureNode, row: HTMLElement, event: DragEvent): void {
        onStructureDragOver(this.tree.state.dragDrop, node, row, event, this.dragDropContext());
    }

    onDrop(node: EditorStructureNode, event: DragEvent): void {
        onStructureDrop(this.tree.state.dragDrop, node, event, this.dragDropContext());
    }

    clearDragState(): void {
        clearStructureDragState(this.tree.state.dragDrop);
    }

    clearDropRow(): void {
        clearStructureDropRow(this.tree.state.dragDrop);
    }

    private readonly onTreeClick = (event: Event): void => {
        if (event.target === this.tree.refs.tree) this.tree.pickers.openRootPicker();
    };

    private readonly onTreeContextMenu = (event: Event): void => {
        if (event.target !== this.tree.refs.tree) return;
        event.preventDefault();
        const mouseEvent = event as MouseEvent;
        this.tree.menus.openRootContextMenu(mouseEvent.clientX, mouseEvent.clientY);
    };

    private dragDropContext() {
        return {
            clearDropRow:    () => this.clearDropRow(),
            emitMove:        (action: "move-before" | "move-after", target: EditorStructureNode, dragged: EditorStructureNode) => {
                this.tree.emitter.emitAction(action, target.editor, undefined, undefined, undefined, dragged.editor);
            },
            isDescendantNode: (candidate: EditorStructureNode, parent: EditorStructureNode) => this.tree.nodes.isDescendantNode(candidate, parent),
        };
    }
}
