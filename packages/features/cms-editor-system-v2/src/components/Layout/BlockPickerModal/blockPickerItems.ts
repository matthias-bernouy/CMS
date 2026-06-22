import type { BlockPickerItem, BlockPickerOption } from "./BlockPickerModal";

export function normalizeBlockPickerOption(option: BlockPickerOption): BlockPickerOption {
    if (option.item) {
        return {
            ...option,
            kind: option.item.kind,
        };
    }

    if (!option.entry) {
        throw new Error("Block picker option requires either item or entry.");
    }

    return {
        ...option,
        kind: "block",
        item: {
            kind: "block",
            entry: option.entry,
        },
    };
}

export function blockPickerOptionItem(option: BlockPickerOption): BlockPickerItem {
    if (option.item) return option.item;
    if (option.entry) {
        return {
            kind: "block",
            entry: option.entry,
        };
    }
    throw new Error("Block picker option requires either item or entry.");
}

export function blockPickerSourceLabel(kind: BlockPickerItem["kind"]): string {
    if (kind === "template") return "Template";
    if (kind === "snippet") return "Snippet";
    if (kind === "media") return "Media";
    return "Block";
}

export function blockPickerItemLabel(item: BlockPickerItem): string {
    return item.kind === "block" ? item.entry.label : item.label;
}

export function blockPickerItemDescription(item: BlockPickerItem): string {
    if (item.kind === "block") return item.entry.description ?? item.entry.tag;
    return item.description ?? blockPickerItemHandle(item);
}

export function blockPickerItemCategory(item: BlockPickerItem): string | undefined {
    return item.kind === "block" ? item.entry.category : item.category;
}

export function blockPickerItemSubCategory(item: BlockPickerItem): string | undefined {
    return item.kind === "block" ? item.entry.subCategory : item.subCategory;
}

export function blockPickerItemIcon(item: BlockPickerItem): string | undefined {
    return item.kind === "block" ? item.entry.icon : item.icon;
}

export function blockPickerItemHandle(item: BlockPickerItem): string {
    if (item.kind === "block") return item.entry.tag;
    if (item.kind === "snippet") return item.identifier;
    if (item.kind === "media") return item.accept?.join(", ") ?? "media";
    return item.id;
}

export function blockPickerIconText(item: BlockPickerItem): string {
    return (blockPickerItemIcon(item) ?? blockPickerItemLabel(item)).slice(0, 1).toUpperCase();
}

export function blockPickerCategoryLabel(option: BlockPickerOption): string {
    const item = blockPickerOptionItem(option);
    const category = blockPickerItemCategory(item) ?? blockPickerSourceLabel(item.kind);
    const subCategory = blockPickerItemSubCategory(item);
    return subCategory ? `${category} / ${subCategory}` : category;
}

export function blockPickerOptionMatches(option: BlockPickerOption, query: string): boolean {
    if (!query) return true;
    const item = blockPickerOptionItem(option);
    return [
        blockPickerItemLabel(item),
        blockPickerItemDescription(item),
        blockPickerItemCategory(item),
        blockPickerItemSubCategory(item),
        blockPickerItemHandle(item),
        option.slotLabel,
    ].some(value => value?.toLowerCase().includes(query));
}
