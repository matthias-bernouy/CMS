import { blockPickerCategoryLabel, blockPickerOptionItem, blockPickerOptionMatches } from "./blockPickerItems";
import type { BlockPickerItem, BlockPickerOption, BlockPickerSlotGroup } from "./blockPickerTypes";

export function blockPickerVisibleOptions(
    group: BlockPickerSlotGroup | undefined,
    source: BlockPickerItem["kind"],
    category: string,
    query: string,
): BlockPickerOption[] {
    return (
        group?.options.filter((option) => {
            const item = blockPickerOptionItem(option);
            if (item.kind !== source) {
                return false;
            }
            if (category && blockPickerCategoryLabel(option) !== category) {
                return false;
            }
            return blockPickerOptionMatches(option, query);
        }) ?? []
    );
}

export function blockPickerOptionsForSource(
    group: BlockPickerSlotGroup | undefined,
    source: BlockPickerItem["kind"],
): BlockPickerOption[] {
    return group?.options.filter((option) => blockPickerOptionItem(option).kind === source) ?? [];
}

export function blockPickerSourceCount(
    group: BlockPickerSlotGroup | undefined,
    source: BlockPickerItem["kind"],
): number {
    return blockPickerOptionsForSource(group, source).length;
}

export function blockPickerCategoryCount(
    group: BlockPickerSlotGroup | undefined,
    source: BlockPickerItem["kind"],
    category: string,
): number {
    return (
        group?.options.filter(
            (option) => blockPickerOptionItem(option).kind === source && blockPickerCategoryLabel(option) === category,
        ).length ?? 0
    );
}

export function blockPickerCategories(
    group: BlockPickerSlotGroup | undefined,
    source: BlockPickerItem["kind"],
): string[] {
    const categories = new Set<string>();
    for (const option of group?.options ?? []) {
        if (blockPickerOptionItem(option).kind === source) {
            categories.add(blockPickerCategoryLabel(option));
        }
    }
    return [...categories].sort((left, right) => left.localeCompare(right));
}

export function activeBlockPickerGroup(
    groups: BlockPickerSlotGroup[],
    activeSlotKey: string,
): BlockPickerSlotGroup | undefined {
    return groups.find((group) => (group.slot ?? "") === activeSlotKey) ?? groups[0];
}

export function firstEnabledBlockPickerGroup(groups: BlockPickerSlotGroup[]): BlockPickerSlotGroup | undefined {
    return groups.find((group) => !group.disabledReason) ?? groups[0];
}
