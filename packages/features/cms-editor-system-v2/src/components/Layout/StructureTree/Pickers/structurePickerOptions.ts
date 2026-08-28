import type { ContentSlot } from "@bernouy/cms-content/editor";
import type { BlockPickerItem, BlockPickerOption } from "../../Pickers/BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode } from "../../../../runtime";
import type { StructurePickerGroupContext } from "./structurePickerGroups";
import { isCatalogEntryInsertable } from "../../../../policy/editorInteractionPolicy";
import { acceptsEntry, mediaAcceptForSlot } from "../../../../policy/contentSlotAcceptance";

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
    return context.slotChildCount(parent, slot) - replacedCount + 1 <= slot.max;
}
