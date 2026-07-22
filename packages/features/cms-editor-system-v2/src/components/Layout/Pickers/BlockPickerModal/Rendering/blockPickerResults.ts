import { blockPickerVisibleOptions } from "../blockPickerState";
import type { BlockPickerItem, BlockPickerOption, BlockPickerSlotGroup } from "../blockPickerTypes";
import { renderBlockPickerDetails, renderBlockPickerOption } from "./blockPickerView";

export function renderBlockPickerResults(input: {
    activeCategory: string;
    activeOption: BlockPickerOption | null;
    activeSource: BlockPickerItem["kind"];
    details: HTMLElement;
    group: BlockPickerSlotGroup | undefined;
    onActivate: (option: BlockPickerOption) => void;
    onSelect: (option: BlockPickerOption) => void;
    query: string;
    results: HTMLElement;
}): BlockPickerOption | null {
    const options = blockPickerVisibleOptions(input.group, input.activeSource, input.activeCategory, input.query);
    input.results.replaceChildren();
    if (input.group?.disabledReason || options.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = input.group?.disabledReason ?? "No content available";
        input.results.append(empty);
        renderBlockPickerDetails(input.details, null, input.onSelect);
        return null;
    }

    const activeOption = input.activeOption && options.includes(input.activeOption) ? input.activeOption : options[0]!;
    for (const option of options) {
        input.results.append(renderBlockPickerOption(option, activeOption, input.onActivate, input.onSelect));
    }
    renderBlockPickerDetails(input.details, activeOption, input.onSelect);
    return activeOption;
}
