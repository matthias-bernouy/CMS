import { BLOCK_PICKER_SELECT_EVENT } from "../../../../Pickers/BlockPickerModal/BlockPickerModal";
import {
    CONDITION_PICKER_APPLY_EVENT,
    CONDITION_PICKER_REMOVE_EVENT,
} from "../../../../Pickers/ConditionPicker/ConditionPicker";
import {
    DATA_SOURCE_PICKER_REMOVE_EVENT,
    DATA_SOURCE_PICKER_SELECT_EVENT,
} from "../../../../Pickers/DataSourcePicker/DataSourcePicker";
import type { StructureTreeController } from "../structureTreeController";

export type StructureTreeEventHandlers = {
    blockPickerSelect: EventListener;
    conditionApply: EventListener;
    conditionRemove: EventListener;
    dataSourceRemove: EventListener;
    dataSourceSelect: EventListener;
    documentClick: EventListener;
    documentKeydown: EventListener;
    treeClick: EventListener;
    treeContextMenu: EventListener;
};

export function connectStructureTreeEvents(tree: StructureTreeController, handlers: StructureTreeEventHandlers): void {
    updateStructureTreeEvents(tree, handlers, "addEventListener");
}

export function disconnectStructureTreeEvents(
    tree: StructureTreeController,
    handlers: StructureTreeEventHandlers,
): void {
    updateStructureTreeEvents(tree, handlers, "removeEventListener");
}

function updateStructureTreeEvents(
    tree: StructureTreeController,
    handlers: StructureTreeEventHandlers,
    action: "addEventListener" | "removeEventListener",
): void {
    tree.host.ownerDocument[action]("click", handlers.documentClick);
    tree.host.ownerDocument[action]("keydown", handlers.documentKeydown);
    tree.refs.blockPicker[action](BLOCK_PICKER_SELECT_EVENT, handlers.blockPickerSelect);
    tree.refs.dataSourcePicker[action](DATA_SOURCE_PICKER_SELECT_EVENT, handlers.dataSourceSelect);
    tree.refs.dataSourcePicker[action](DATA_SOURCE_PICKER_REMOVE_EVENT, handlers.dataSourceRemove);
    tree.refs.conditionPicker[action](CONDITION_PICKER_APPLY_EVENT, handlers.conditionApply);
    tree.refs.conditionPicker[action](CONDITION_PICKER_REMOVE_EVENT, handlers.conditionRemove);
    tree.refs.tree[action]("click", handlers.treeClick);
    tree.refs.tree[action]("contextmenu", handlers.treeContextMenu);
}
