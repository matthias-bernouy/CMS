import { type BlockPickerSelectDetail } from "../../../Pickers/BlockPickerModal/BlockPickerModal";
import { type DataSourcePickerSelectDetail } from "../../../Pickers/DataSourcePicker/DataSourcePicker";
import { type ConditionPickerApplyDetail } from "../../../Pickers/ConditionPicker/ConditionPicker";
import type { EditorStructureNode } from "../../../../../runtime";
import { onStructureDocumentKeydown } from "../../Actions/structureKeyboard";
import type { StructureTreeController } from "./structureTreeController";
import {
    connectStructureTreeEvents,
    disconnectStructureTreeEvents,
    type StructureTreeEventHandlers,
} from "./Support/structureTreeEventBindings";
import {
    clearStructureTreeDrag,
    clearStructureTreeDropRow,
    dropStructureTreeDrag,
    overStructureTreeDrag,
    startStructureTreeDrag,
} from "./Support/structureTreeDragEvents";

export class StructureTreeEvents {
    readonly onBlockPickerSelect = (event: CustomEvent<BlockPickerSelectDetail>): void => {
        if (!this.tree.state.pendingPickerAction) {
            return;
        }
        const { action, editor } = this.tree.state.pendingPickerAction;
        this.tree.emitter.emitAction(action, editor, event.detail.option.item, event.detail.option.slot);
        this.tree.state.pendingPickerAction = null;
    };

    readonly onDataSourceSelect = (event: CustomEvent<DataSourcePickerSelectDetail>): void => {
        if (!this.tree.state.pendingSourceEditor) {
            return;
        }
        this.tree.emitter.emitAction(
            "set-source",
            this.tree.state.pendingSourceEditor,
            undefined,
            undefined,
            undefined,
            undefined,
            event.detail.source,
            event.detail.binding,
        );
        this.tree.state.pendingSourceEditor = null;
    };

    readonly onDataSourceRemove = (): void => {
        if (!this.tree.state.pendingSourceEditor) {
            return;
        }
        this.tree.emitter.emitAction("remove-source", this.tree.state.pendingSourceEditor);
        this.tree.state.pendingSourceEditor = null;
    };

    readonly onConditionApply = (event: CustomEvent<ConditionPickerApplyDetail>): void => {
        if (!this.tree.state.pendingConditionEditor) {
            return;
        }
        if (event.detail.expression) {
            this.tree.emitter.emitAction(
                "set-condition",
                this.tree.state.pendingConditionEditor,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                event.detail.expression,
            );
        } else {
            this.tree.emitter.emitAction(
                "set-source-status-conditions",
                this.tree.state.pendingConditionEditor,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                event.detail.conditions,
            );
        }
        this.tree.state.pendingConditionEditor = null;
    };

    readonly onConditionRemove = (): void => {
        if (!this.tree.state.pendingConditionEditor) {
            return;
        }
        this.tree.emitter.emitAction("remove-source-status-condition", this.tree.state.pendingConditionEditor);
        this.tree.state.pendingConditionEditor = null;
    };

    readonly onDocumentKeydown = (event: KeyboardEvent): void => {
        onStructureDocumentKeydown(event, {
            closeContextMenu: () => this.tree.emitter.closeContextMenu(),
            emitCopy: (editor) => this.tree.emitter.emitAction("copy", editor),
            emitDelete: (editor) => this.tree.emitter.emitAction("delete", editor),
            emitPaste: (editor) => this.tree.emitter.emitAction("paste-after", editor),
            selectedEditor: this.tree.state.selectedEditor,
        });
    };

    readonly onDocumentClick = (): void => {
        this.tree.emitter.closeContextMenu();
    };

    constructor(private readonly tree: StructureTreeController) {}

    connect(): void {
        connectStructureTreeEvents(this.tree, this.eventHandlers());
    }

    disconnect(): void {
        disconnectStructureTreeEvents(this.tree, this.eventHandlers());
    }

    onDragStart(node: EditorStructureNode, event: DragEvent): void {
        startStructureTreeDrag(this.tree, node, event);
    }

    onDragOver(node: EditorStructureNode, row: HTMLElement, event: DragEvent): void {
        overStructureTreeDrag(this.tree, node, row, event);
    }

    onDrop(node: EditorStructureNode, event: DragEvent): void {
        dropStructureTreeDrag(this.tree, node, event);
    }

    clearDragState(): void {
        clearStructureTreeDrag(this.tree);
    }

    clearDropRow(): void {
        clearStructureTreeDropRow(this.tree);
    }

    readonly onTreeClick = (event: Event): void => {
        if (event.target === this.tree.refs.tree) {
            this.tree.pickers.openRootPicker();
        }
    };

    readonly onTreeContextMenu = (event: Event): void => {
        if (event.target !== this.tree.refs.tree) {
            return;
        }
        event.preventDefault();
        const mouseEvent = event as MouseEvent;
        this.tree.menus.openRootContextMenu(mouseEvent.clientX, mouseEvent.clientY);
    };

    private eventHandlers(): StructureTreeEventHandlers {
        return {
            blockPickerSelect: this.onBlockPickerSelect as EventListener,
            conditionApply: this.onConditionApply as EventListener,
            conditionRemove: this.onConditionRemove,
            dataSourceRemove: this.onDataSourceRemove,
            dataSourceSelect: this.onDataSourceSelect as EventListener,
            documentClick: this.onDocumentClick,
            documentKeydown: this.onDocumentKeydown as EventListener,
            treeClick: this.onTreeClick,
            treeContextMenu: this.onTreeContextMenu,
        };
    }
}
