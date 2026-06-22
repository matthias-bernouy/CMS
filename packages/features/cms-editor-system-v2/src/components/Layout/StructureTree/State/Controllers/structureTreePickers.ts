import type { Editor } from "@bernouy/cms-content/editor";
import type { BlockPickerItem, BlockPickerSlotGroup } from "../../../BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode, SourceStateStructureNode } from "../../../../../runtime";
import { openPickerOrEmitSingleMedia, useDefaultTemplate, type StructureBlockPickerContext } from "../../Actions/structureBlockPicker";
import { openStructureSourcePicker } from "../../Actions/structureSourcePicker";
import {
    childGroups,
    defaultTemplateGroups,
    defaultTemplateItems,
    hasEnabledGroup,
    isSlotFull,
    replaceGroups,
    rootGroups,
    sourceStateGroups,
    type StructurePickerGroupContext,
} from "../../Pickers/structurePickerGroups";
import type { PendingPickerAction } from "../structureTreeTypes";
import type { StructureTreeController } from "./structureTreeController";

export class StructureTreePickers {
    constructor(private readonly tree: StructureTreeController) {}

    rootGroups(): BlockPickerSlotGroup[] {
        return rootGroups(this.groupContext());
    }

    defaultTemplateGroups(templates: BlockPickerItem[]): BlockPickerSlotGroup[] {
        return defaultTemplateGroups(templates);
    }

    childGroups(node: EditorStructureNode): BlockPickerSlotGroup[] {
        return childGroups(this.groupContext(), node);
    }

    sourceStateGroups(node: SourceStateStructureNode): BlockPickerSlotGroup[] {
        return sourceStateGroups(this.groupContext(), node);
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

    openSourceStatePicker(node: SourceStateStructureNode): void {
        const groups = this.sourceStateGroups(node);
        if (!this.hasEnabledGroup(groups)) return;
        this.openPickerOrEmitSingleMedia({ action: "add-source-state-child", editor: node.sourceEditor, sourceState: node.state }, groups, node.label);
    }

    openPickerOrEmitSingleMedia(action: PendingPickerAction, groups: BlockPickerSlotGroup[], contextLabel: string): void {
        openPickerOrEmitSingleMedia(action, groups, contextLabel, this.blockPickerContext(action.editor));
    }

    openSourcePicker(node: EditorStructureNode): void {
        openStructureSourcePicker(node, {
            dataSources:            this.tree.nodes.sourceDataSources(),
            onRemove:               this.tree.events.onDataSourceRemove,
            onSelect:               this.tree.events.onDataSourceSelect as EventListener,
            picker:                 this.tree.refs.dataSourcePicker,
            setPendingSourceEditor: editor => {
                this.tree.state.pendingSourceEditor = editor;
            },
        });
    }

    defaultTemplateItems(): BlockPickerItem[] {
        return defaultTemplateItems(this.groupContext());
    }

    useDefaultTemplate(templates = this.defaultTemplateItems()): boolean {
        return useDefaultTemplate(templates, this.defaultTemplateGroups(templates), this.blockPickerContext());
    }

    private blockPickerContext(editor?: Editor): StructureBlockPickerContext {
        return {
            emitAction:              (action, item, slot, sourceState) => this.tree.emitter.emitAction(action, editor, item, slot, sourceState),
            openBlockPicker:         (groups, contextLabel) => this.tree.refs.blockPicker.open(groups, contextLabel),
            setPendingPickerAction: action => {
                this.tree.state.pendingPickerAction = action;
            },
        };
    }

    private groupContext(): StructurePickerGroupContext {
        return {
            catalog:                  this.tree.state.catalog,
            insertItems:              this.tree.state.insertItems,
            defaultTemplateSelection: this.tree.state.defaultTemplateSelection,
            editorChildrenOf:         parent => this.tree.nodes.editorChildrenOf(parent),
            nodeForEditor:            editor => this.tree.nodes.nodeForEditor(editor),
            parentNode:               child => this.tree.nodes.parentNode(child),
            sameSlot:                 (left, right) => this.tree.nodes.sameSlot(left, right),
            slotChildCount:           (parent, slot) => this.tree.nodes.slotChildCount(parent, slot),
            slotForChild:             (parent, child) => this.tree.nodes.slotForChild(parent, child),
        };
    }
}
