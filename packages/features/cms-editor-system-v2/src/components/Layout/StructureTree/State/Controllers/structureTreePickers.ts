import {
    CMS_BINDING_ATTRIBUTES,
    parseSource,
    sourceStatusConditionsFromElement,
    type DataScope,
    type Editor,
} from "@bernouy/cms-content/editor";
import { conditionFieldOptions } from "../../../ConditionPicker/fieldOptions";
import type { BlockPickerItem, BlockPickerSlotGroup } from "../../../BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode } from "../../../../../runtime";
import {
    CONDITION_PICKER_APPLY_EVENT,
    CONDITION_PICKER_REMOVE_EVENT,
    type ConditionPickerCondition,
} from "../../../ConditionPicker/ConditionPicker";
import {
    openPickerOrEmitSingleMedia,
    useDefaultTemplate,
    type StructureBlockPickerContext,
} from "../../Actions/structureBlockPicker";
import { openStructureSourcePicker } from "../../Actions/structureSourcePicker";
import {
    childGroups,
    defaultTemplateGroups,
    defaultTemplateItems,
    hasEnabledGroup,
    isSlotFull,
    replaceGroups,
    rootGroups,
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
        this.tree.state.pendingConditionEditor = node.editor;
        const picker = this.tree.refs.conditionPicker;
        picker.removeEventListener(CONDITION_PICKER_APPLY_EVENT, this.tree.events.onConditionApply as EventListener);
        picker.removeEventListener(CONDITION_PICKER_REMOVE_EVENT, this.tree.events.onConditionRemove);
        picker.addEventListener(CONDITION_PICKER_APPLY_EVENT, this.tree.events.onConditionApply as EventListener);
        picker.addEventListener(CONDITION_PICKER_REMOVE_EVENT, this.tree.events.onConditionRemove);
        const sources = this.tree.nodes
            .sourceAncestorNodes(node)
            .filter((source) => this.tree.nodes.canSetSourceStatusCondition(node, source))
            .map((source) => ({
                editor: source.editor,
                label: source.label,
                sourceName: this.sourceName(source),
            }));
        picker.open({
            sources,
            selected: this.selectedConditions(node),
            fields: conditionFieldOptions(this.dataScopes(node)),
            expression: this.customConditionExpression(node),
            contextLabel: node.label,
            canRemove: node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.condition),
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
            insertItems: this.tree.state.insertItems,
            defaultTemplateSelection: this.tree.state.defaultTemplateSelection,
            editorChildrenOf: (parent) => this.tree.nodes.editorChildrenOf(parent),
            nodeForEditor: (editor) => this.tree.nodes.nodeForEditor(editor),
            parentNode: (child) => this.tree.nodes.parentNode(child),
            sameSlot: (left, right) => this.tree.nodes.sameSlot(left, right),
            slotChildCount: (parent, slot) => this.tree.nodes.slotChildCount(parent, slot),
            slotForChild: (parent, child) => this.tree.nodes.slotForChild(parent, child),
        };
    }

    private selectedConditions(node: EditorStructureNode): ConditionPickerCondition[] {
        const sources = this.tree.nodes.sourceAncestorNodes(node);
        const selected: ConditionPickerCondition[] = [];
        for (const condition of this.tree.nodes.sourceStatusConditions(node)) {
            const source = condition.sourceId
                ? sources.find(
                      (candidate) =>
                          candidate.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceId) === condition.sourceId,
                  )
                : sources[0];
            if (!source) {
                continue;
            }
            selected.push({ sourceEditor: source.editor, sourceState: condition.state });
        }
        return selected;
    }

    private sourceName(source: EditorStructureNode): string | undefined {
        const binding = parseSource(source.target.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "");
        if (!binding) {
            return undefined;
        }
        const dataSource = this.tree.state.dataSources.find((candidate) =>
            sourceUrlMatchesBinding(candidate.url, binding.url),
        );
        return dataSource?.label ?? binding.alias ?? binding.url;
    }

    private dataScopes(node: EditorStructureNode): DataScope[] {
        const nodes: EditorStructureNode[] = [];
        for (let current: EditorStructureNode | null = node; current; current = this.tree.nodes.parentNode(current)) {
            nodes.unshift(current);
        }
        return nodes.flatMap((candidate) => candidate.editor.getDataScopes());
    }

    private customConditionExpression(node: EditorStructureNode): string {
        const value = node.target.getAttribute(CMS_BINDING_ATTRIBUTES.condition)?.trim() ?? "";
        return value && sourceStatusConditionsFromElement(node.target).length === 0 ? value : "";
    }
}

function sourceUrlMatchesBinding(sourceUrl: string, bindingUrl: string): boolean {
    return (
        bindingUrl === sourceUrl ||
        bindingUrl.startsWith(`${sourceUrl}?`) ||
        (sourceUrl.includes("?") && bindingUrl.startsWith(`${sourceUrl}&`))
    );
}
