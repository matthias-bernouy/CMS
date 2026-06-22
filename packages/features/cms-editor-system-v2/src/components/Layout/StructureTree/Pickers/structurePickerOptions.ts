import { CMS_SNIPPET_TAG } from "@bernouy/cms-content/editor";
import type {
    ContentSlot,
    ContentSlotAccept,
    EditorCatalogEntry,
} from "@bernouy/cms-content/editor";
import type {
    BlockPickerItem,
    BlockPickerOption,
} from "../../BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode } from "../../../../runtime";
import type { StructurePickerGroupContext } from "./structurePickerGroups";

export function slotOptions(
    context: StructurePickerGroupContext,
    slot: ContentSlot,
    parent: EditorStructureNode,
    replaced?: EditorStructureNode,
): BlockPickerOption[] {
    const blockOptions: BlockPickerOption[] = context.catalog.filter(entry => {
        if (entry.category === "Runtime") return false;
        return slot.accepts.some(accept => acceptsEntry(accept, entry));
    }).map(entry => ({
        item: {
            kind: "block" as const,
            entry,
        },
        entry,
        slot: slot.slot,
        slotLabel: slot.label,
    }));

    const externalOptions: BlockPickerOption[] = context.insertItems
        .filter(item => slot.accepts.some(accept => acceptsItem(accept, item)))
        .filter(item => canFitItem(context, parent, slot, item, replaced))
        .map(item => ({
            item,
            slot:      slot.slot,
            slotLabel: slot.label,
        }));

    const mediaAccept = mediaAcceptForSlot(slot);
    const mediaOptions: BlockPickerOption[] = mediaAccept
        ? [{
            item: {
                kind:        "media" as const,
                label:       "Media",
                description: "Choose a file from the CMS library.",
                category:    "Media",
                subCategory: mediaAccept.join(", "),
                icon:        "M",
                accept:      mediaAccept,
            },
            slot:      slot.slot,
            slotLabel: slot.label,
        }]
        : [];

    return [
        ...blockOptions.filter(option => canFitItem(context, parent, slot, option.item!, replaced)),
        ...externalOptions,
        ...mediaOptions.filter(option => option.item && canFitItem(context, parent, slot, option.item, replaced)),
    ];
}

export function mediaAcceptForSlot(slot: ContentSlot): ("image" | "bitmap" | "svg" | "video" | "audio" | "document")[] | null {
    const explicit = slot.accepts.find(accept => accept.kind === "media");
    if (explicit?.kind === "media") return explicit.accept ?? ["image"];

    if (slot.accepts.some(accept => accept.kind === "component" && accept.tag.toLowerCase() === "img")) {
        return ["image"];
    }

    if (slot.accepts.some(accept => accept.kind === "any-component")) {
        return ["image"];
    }

    return null;
}

export function acceptsEntry(accept: ContentSlotAccept, entry: EditorCatalogEntry): boolean {
    if (accept.kind === "media") return false;
    if (accept.kind === "any-component") return true;
    return accept.tag.toLowerCase() === entry.tag.toLowerCase();
}

export function acceptsItem(accept: ContentSlotAccept, item: BlockPickerItem): boolean {
    if (item.kind === "media") return accept.kind === "media";
    if (item.kind === "block") return acceptsEntry(accept, item.entry);
    if (accept.kind === "media") return false;
    if (accept.kind === "any-component") return true;
    if (item.kind === "snippet") return accept.tag.toLowerCase() === CMS_SNIPPET_TAG;
    return false;
}

export function canFitItem(
    context: StructurePickerGroupContext,
    parent: EditorStructureNode,
    slot: ContentSlot,
    item: BlockPickerItem,
    replaced?: EditorStructureNode,
): boolean {
    if (typeof slot.max !== "number") return true;

    const replacedSlot = replaced ? context.slotForChild(parent, replaced) : undefined;
    const replacedCount = replacedSlot && context.sameSlot(replacedSlot, slot) ? 1 : 0;
    return context.slotChildCount(parent, slot) - replacedCount + itemRootCount(item) <= slot.max;
}

export function itemRootCount(item: BlockPickerItem): number {
    if (item.kind !== "template") return 1;

    const template = document.createElement("template");
    template.innerHTML = item.content;
    const elementCount = template.content.children.length;
    if (elementCount > 0) return elementCount;

    return template.content.textContent?.trim() ? 1 : 0;
}
