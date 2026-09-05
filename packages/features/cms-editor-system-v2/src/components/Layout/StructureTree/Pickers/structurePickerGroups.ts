import type { ContentSlot, EditorCatalog } from "@bernouy/cms-content/editor";
import type {
    BlockPickerItem,
    BlockPickerOption,
    BlockPickerSlotGroup,
} from "../../Pickers/BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode } from "../../../../runtime";
import { slotOptions } from "./structurePickerOptions";
import {
    isCatalogEntryInsertable,
    type ResolvedEditorInteractionPolicy,
} from "../../../../policy/editorInteractionPolicy";
import { isEditorPlacementAllowed } from "../../../../policy/editorPlacement";

export type StructurePickerGroupContext = {
    catalog: EditorCatalog;
    editingPolicy: ResolvedEditorInteractionPolicy;
    rootNode: EditorStructureNode | null;
    editorChildrenOf(parent: EditorStructureNode): EditorStructureNode[];
    nodeForEditor(editor: EditorStructureNode["editor"]): EditorStructureNode | null;
    parentNode(child: EditorStructureNode): EditorStructureNode | null;
    sameSlot(left: ContentSlot, right: ContentSlot): boolean;
    slotChildCount(parent: EditorStructureNode, slot: ContentSlot): number;
    slotForChild(parent: EditorStructureNode, child: EditorStructureNode): ContentSlot | undefined;
};

export function rootGroups(context: StructurePickerGroupContext): BlockPickerSlotGroup[] {
    if (context.rootNode) {
        return childGroups(context, context.rootNode);
    }
    return pageGroups(context);
}

function pageGroups(context: StructurePickerGroupContext): BlockPickerSlotGroup[] {
    const options: BlockPickerOption[] = [
        ...context.catalog
            .filter(
                (entry) =>
                    entry.category !== "Runtime" &&
                    isCatalogEntryInsertable(context.editingPolicy, entry) &&
                    isEditorPlacementAllowed(entry, { kind: "root" }),
            )
            .map((entry) => ({
                item: {
                    kind: "block" as const,
                    entry,
                },
                entry,
                slotLabel: "Page",
            })),
        ...(context.editingPolicy.looseMedia ? rootMediaOptions() : []),
    ];

    return [
        {
            label: "Page",
            disabledReason: options.length === 0 ? "No compatible blocks." : undefined,
            options,
        },
    ];
}

function rootMediaOptions(): BlockPickerOption[] {
    return [
        {
            item: {
                kind: "media",
                label: "Image",
                description: "Choose an image from the CMS library.",
                category: "Media",
                icon: "I",
                accept: ["image"],
            },
            slotLabel: "Page",
        },
        {
            item: {
                kind: "media",
                label: "SVG",
                description: "Choose a sanitized SVG from the CMS library.",
                category: "Media",
                icon: "S",
                accept: ["svg"],
            },
            slotLabel: "Page",
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
        return pageGroups(context);
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

export function isSlotFull(
    context: StructurePickerGroupContext,
    parent: EditorStructureNode,
    slot: ContentSlot,
): boolean {
    return typeof slot.max === "number" && context.slotChildCount(parent, slot) >= slot.max;
}
