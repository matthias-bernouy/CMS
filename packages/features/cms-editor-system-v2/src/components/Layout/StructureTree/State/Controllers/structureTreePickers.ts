import { CMS_BINDING_ATTRIBUTES, type Editor } from "@bernouy/cms-content/editor";
import type { BlockPickerItem, BlockPickerSlotGroup } from "../../../Pickers/BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode } from "../../../../../runtime";
import {
    CONDITION_PICKER_APPLY_EVENT,
    CONDITION_PICKER_REMOVE_EVENT,
} from "../../../Pickers/ConditionPicker/ConditionPicker";
import { openPickerOrEmitSingleMedia, type StructureBlockPickerContext } from "../../Actions/structureBlockPicker";
import { openStructureSourcePicker } from "../../Actions/structureSourcePicker";
import {
    childGroups,
    hasEnabledGroup,
    isSlotFull,
    replaceGroups,
    rootGroups,
    type StructurePickerGroupContext,
} from "../../Pickers/structurePickerGroups";
import type { PendingPickerAction } from "../structureTreeTypes";
import type { StructureTreeController } from "./structureTreeController";
import { structureConditionPickerOptions } from "./Support/structureConditionPickerOptions";

export class StructureTreePickers {
    constructor(private readonly tree: StructureTreeController) {}

    rootGroups(): BlockPickerSlotGroup[] {
        return rootGroups(this.groupContext());
    }

    childGroups(node: EditorStructureNode): BlockPickerSlotGroup[] {
        return childGroups(this.groupContext(), node);
    }

    replaceGroups(node: EditorStructureNode): BlockPickerSlotGroup[] {
        return replaceGroups(this.groupContext(), node);
    }

    isSlotFull(parent: EditorStructureNode, slot: Parameters<typeof isSlotFull>[2]): boolean {
        return isSlotFull(this.groupContext(), parent, slot);
    }

    hasEnabledGroup(groups: BlockPickerSlotGroup[]): boolean {
        return hasEnabledGroup(groups);
    }

    openRootPicker(): void {
        this.tree.state.pendingPickerAction = { action: "add-root" };
        this.tree.refs.blockPicker.open(this.rootGroups(), "Page");
    }

    openPickerOrEmitSingleMedia(
        action: PendingPickerAction,
        groups: BlockPickerSlotGroup[],
        contextLabel: string,
    ): void {
        openPickerOrEmitSingleMedia(action, groups, contextLabel, this.blockPickerContext(action.editor));
    }

    openSourcePicker(node: EditorStructureNode): void {
        if (!this.tree.state.editingPolicy.bindings) {
            return;
        }
        openStructureSourcePicker(node, {
            dataSources: this.tree.nodes.sourceDataSources(),
            onRemove: this.tree.events.onDataSourceRemove,
            onSelect: this.tree.events.onDataSourceSelect as EventListener,
            picker: this.tree.refs.dataSourcePicker,
            setPendingSourceEditor: (editor) => {
                this.tree.state.pendingSourceEditor = editor;
            },
        });
    }

    openConditionPicker(node: EditorStructureNode): void {
        const policy = this.tree.state.editingPolicy;
        if (!policy.bindings || !policy.conditions) {
            return;
        }
        this.tree.state.pendingConditionEditor = node.editor;
        const picker = this.tree.refs.conditionPicker;
        picker.removeEventListener(CONDITION_PICKER_APPLY_EVENT, this.tree.events.onConditionApply as EventListener);
        picker.removeEventListener(CONDITION_PICKER_REMOVE_EVENT, this.tree.events.onConditionRemove);
        picker.addEventListener(CONDITION_PICKER_APPLY_EVENT, this.tree.events.onConditionApply as EventListener);
        picker.addEventListener(CONDITION_PICKER_REMOVE_EVENT, this.tree.events.onConditionRemove);
        picker.open(structureConditionPickerOptions(this.tree, node));
    }

    private blockPickerContext(editor?: Editor): StructureBlockPickerContext {
        return {
            emitAction: (action, item, slot) => this.tree.emitter.emitAction(action, editor, item, slot),
            openBlockPicker: (groups, contextLabel) => this.tree.refs.blockPicker.open(groups, contextLabel),
            setPendingPickerAction: (action) => {
                this.tree.state.pendingPickerAction = action;
            },
        };
    }

    private groupContext(): StructurePickerGroupContext {
        return {
            catalog: this.tree.state.catalog,
            editingPolicy: this.tree.state.editingPolicy,
            rootNode: this.tree.state.rootNode,
            editorChildrenOf: (parent) => this.tree.nodes.editorChildrenOf(parent),
            nodeForEditor: (editor) => this.tree.nodes.nodeForEditor(editor),
            parentNode: (child) => this.tree.nodes.parentNode(child),
            sameSlot: (left, right) => this.tree.nodes.sameSlot(left, right),
            slotChildCount: (parent, slot) => this.tree.nodes.slotChildCount(parent, slot),
            slotForChild: (parent, child) => this.tree.nodes.slotForChild(parent, child),
        };
    }
}
