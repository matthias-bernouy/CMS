import type { ContentSlot } from "@bernouy/cms-content/editor";
import type { BlockPickerItem, BlockPickerOption } from "../../Pickers/BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode } from "../../../../runtime";
import type { StructurePickerGroupContext } from "./structurePickerGroups";
import { isCatalogEntryInsertable, isInsertionItemAllowed } from "../../../../policy/editorInteractionPolicy";
import { acceptsEntry, acceptsItem, mediaAcceptForSlot } from "../../../../policy/contentSlotAcceptance";

export function slotOptions(
    context: StructurePickerGroupContext,
    slot: ContentSlot,
    parent: EditorStructureNode,
    replaced?: EditorStructureNode,
): BlockPickerOption[] {
    const blockOptions: BlockPickerOption[] = context.catalog
        .filter((entry) => {
            if (entry.category === "Runtime") {
                return false;
            }
            return (
                isCatalogEntryInsertable(context.editingPolicy, entry) &&
                slot.accepts.some((accept) => acceptsEntry(accept, entry))
            );
        })
        .map((entry) => ({
            item: {
                kind: "block" as const,
                entry,
            },
            entry,
            slot: slot.slot,
            slotLabel: slot.label,
        }));

    const externalOptions: BlockPickerOption[] = context.insertItems
        .filter((item) => isInsertionItemAllowed(context.editingPolicy, item))
        .filter((item) => slot.accepts.some((accept) => acceptsItem(accept, item)))
        .filter((item) => canFitItem(context, parent, slot, item, replaced))
        .map((item) => ({
            item,
            slot: slot.slot,
            slotLabel: slot.label,
        }));

    const mediaAccept = mediaAcceptForSlot(slot);
    const mediaOptions: BlockPickerOption[] =
        mediaAccept && context.editingPolicy.looseMedia
            ? [
                  {
                      item: {
                          kind: "media" as const,
                          label: "Media",
                          description: "Choose a file from the CMS library.",
                          category: "Media",
                          subCategory: mediaAccept.join(", "),
                          icon: "M",
                          accept: mediaAccept,
                      },
                      slot: slot.slot,
                      slotLabel: slot.label,
                  },
              ]
            : [];

    return [
        ...blockOptions.filter((option) => canFitItem(context, parent, slot, option.item!, replaced)),
        ...externalOptions,
        ...mediaOptions.filter((option) => option.item && canFitItem(context, parent, slot, option.item, replaced)),
    ];
}

export function canFitItem(
    context: StructurePickerGroupContext,
    parent: EditorStructureNode,
    slot: ContentSlot,
    item: BlockPickerItem,
    replaced?: EditorStructureNode,
): boolean {
    if (typeof slot.max !== "number") {
        return true;
    }

    const replacedSlot = replaced ? context.slotForChild(parent, replaced) : undefined;
    const replacedCount = replacedSlot && context.sameSlot(replacedSlot, slot) ? 1 : 0;
    return context.slotChildCount(parent, slot) - replacedCount + itemRootCount(item) <= slot.max;
}

export function itemRootCount(item: BlockPickerItem): number {
    if (item.kind !== "template") {
        return 1;
    }

    const template = document.createElement("template");
    template.innerHTML = item.content;
    const elementCount = template.content.children.length;
    if (elementCount > 0) {
        return elementCount;
    }

    return template.content.textContent?.trim() ? 1 : 0;
}
