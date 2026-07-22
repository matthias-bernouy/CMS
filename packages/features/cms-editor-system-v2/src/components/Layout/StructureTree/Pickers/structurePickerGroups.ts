import type { ContentSlot, EditorCatalog } from "@bernouy/cms-content/editor";
import type {
    BlockPickerItem,
    BlockPickerOption,
    BlockPickerSlotGroup,
} from "../../Pickers/BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode } from "../../../../runtime";
import { slotOptions } from "./structurePickerOptions";

export type DefaultTemplateSelection = {
    category?: string;
};

export type StructurePickerGroupContext = {
    catalog: EditorCatalog;
    insertItems: BlockPickerItem[];
    defaultTemplateSelection: DefaultTemplateSelection;
    editorChildrenOf(parent: EditorStructureNode): EditorStructureNode[];
    nodeForEditor(editor: EditorStructureNode["editor"]): EditorStructureNode | null;
    parentNode(child: EditorStructureNode): EditorStructureNode | null;
    sameSlot(left: ContentSlot, right: ContentSlot): boolean;
    slotChildCount(parent: EditorStructureNode, slot: ContentSlot): number;
    slotForChild(parent: EditorStructureNode, child: EditorStructureNode): ContentSlot | undefined;
};

export function rootGroups(context: StructurePickerGroupContext): BlockPickerSlotGroup[] {
    const options: BlockPickerOption[] = [
        ...context.catalog
            .filter((entry) => entry.category !== "Runtime")
            .map((entry) => ({
                item: {
                    kind: "block" as const,
                    entry,
                },
                entry,
                slotLabel: "Page",
            })),
        ...context.insertItems
            .filter((item) => item.kind !== "media")
            .map((item) => ({
                item,
                slotLabel: "Page",
            })),
    ];

    return [
        {
            label: "Page",
            disabledReason: options.length === 0 ? "No compatible blocks." : undefined,
            options,
        },
    ];
}

export function defaultTemplateGroups(templates: BlockPickerItem[]): BlockPickerSlotGroup[] {
    return [
        {
            label: "Default templates",
            disabledReason: templates.length === 0 ? "No default templates." : undefined,
            options: templates.map((item) => ({
                item,
                slotLabel: "Page",
            })),
        },
    ];
}

export function childGroups(context: StructurePickerGroupContext, node: EditorStructureNode): BlockPickerSlotGroup[] {
    return node.editor.getContentSlots().map((slot) => {
        const isFull = isSlotFull(context, node, slot);
        const options = isFull ? [] : slotOptions(context, slot, node);

        return {
            slot: slot.slot,
            label: slot.label,
            disabledReason: isFull ? "This slot is full." : options.length === 0 ? "No compatible blocks." : undefined,
            options,
        };
    });
}

export function replaceGroups(context: StructurePickerGroupContext, node: EditorStructureNode): BlockPickerSlotGroup[] {
    const parent = context.parentNode(node);
    if (!parent) {
        return rootGroups(context);
    }

    const slot = context.slotForChild(parent, node);
    if (!slot) {
        return [];
    }

    const options = slotOptions(context, slot, parent, node);

    return [
        {
            slot: slot.slot,
            label: slot.label,
            disabledReason: options.length === 0 ? "No compatible blocks." : undefined,
            options,
        },
    ];
}

export function hasEnabledGroup(groups: BlockPickerSlotGroup[]): boolean {
    return groups.some((group) => !group.disabledReason && group.options.length > 0);
}

export function defaultTemplateItems(context: StructurePickerGroupContext): BlockPickerItem[] {
    const templates = context.insertItems.filter(
        (item): item is Extract<BlockPickerItem, { kind: "template" }> => item.kind === "template",
    );
    if (context.defaultTemplateSelection.category) {
        return templates.filter((item) => item.category === context.defaultTemplateSelection.category);
    }
    return [];
}

export function isSlotFull(
    context: StructurePickerGroupContext,
    parent: EditorStructureNode,
    slot: ContentSlot,
): boolean {
    return typeof slot.max === "number" && context.slotChildCount(parent, slot) >= slot.max;
}
