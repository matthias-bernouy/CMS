import { blockPickerCategories, blockPickerCategoryCount, blockPickerSourceCount } from "../blockPickerState";
import type { BlockPickerItem, BlockPickerSlotGroup } from "../blockPickerTypes";

export function renderBlockPickerSidebar(input: {
    activeCategory: string;
    activeSource: BlockPickerItem["kind"];
    categories: HTMLElement;
    group: BlockPickerSlotGroup | undefined;
    onCategory: (category: string) => void;
    onSource: (source: BlockPickerItem["kind"]) => void;
    onSingleMedia: () => boolean;
    sources: HTMLElement;
}): void {
    input.sources.replaceChildren();
    input.categories.replaceChildren();
    input.sources.append(sourceButton("Blocks", "block", input), sourceButton("Media", "media", input));
    input.categories.append(
        filterButton(
            "All",
            input.activeCategory === "",
            () => input.onCategory(""),
            blockPickerSourceCount(input.group, input.activeSource),
        ),
    );
    for (const category of blockPickerCategories(input.group, input.activeSource)) {
        input.categories.append(
            filterButton(
                category,
                input.activeCategory === category,
                () => input.onCategory(category),
                blockPickerCategoryCount(input.group, input.activeSource, category),
            ),
        );
    }
}

function sourceButton(
    label: string,
    source: BlockPickerItem["kind"],
    input: Parameters<typeof renderBlockPickerSidebar>[0],
): HTMLButtonElement {
    const count = blockPickerSourceCount(input.group, source);
    return filterButton(
        label,
        input.activeSource === source,
        () => {
            if (source === "media" && input.onSingleMedia()) {
                return;
            }
            input.onSource(source);
        },
        count,
        source !== "block" && count === 0,
    );
}

function filterButton(
    label: string,
    active: boolean,
    onClick: () => void,
    count: number,
    disabled = false,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "filter";
    button.type = "button";
    button.disabled = disabled;
    button.ariaPressed = String(active);
    button.addEventListener("click", () => {
        if (!button.disabled) {
            onClick();
        }
    });
    const text = document.createElement("span");
    text.textContent = label;
    const badge = document.createElement("span");
    badge.className = "count";
    badge.textContent = String(count);
    button.append(text, badge);
    return button;
}
