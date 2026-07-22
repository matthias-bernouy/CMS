import {
    blockPickerCategoryLabel,
    blockPickerIconText,
    blockPickerItemDescription,
    blockPickerItemHandle,
    blockPickerItemLabel,
    blockPickerOptionItem,
    blockPickerSourceLabel,
} from "../blockPickerItems";
import type { BlockPickerOption, BlockPickerSlotGroup } from "../blockPickerTypes";

export function renderBlockPickerDetails(
    container: HTMLElement,
    option: BlockPickerOption | null,
    onSelect: (option: BlockPickerOption) => void,
): void {
    container.replaceChildren();
    if (!option) {
        const empty = document.createElement("div");
        empty.className = "details-empty";
        empty.textContent = "Select content to see details.";
        container.append(empty);
        return;
    }

    const item = blockPickerOptionItem(option);
    const eyebrow = document.createElement("div");
    eyebrow.className = "details-eyebrow";
    eyebrow.textContent = blockPickerSourceLabel(item.kind);
    const title = document.createElement("h3");
    title.textContent = blockPickerItemLabel(item);
    const description = document.createElement("p");
    description.textContent = blockPickerItemDescription(item);
    const preview = document.createElement("div");
    preview.className = "preview";
    const previewIcon = document.createElement("span");
    previewIcon.className = "preview-icon";
    previewIcon.textContent = blockPickerIconText(item);
    preview.append(previewIcon);

    const meta = document.createElement("dl");
    meta.append(
        metaRow("Source", blockPickerSourceLabel(item.kind)),
        metaRow("Handle", blockPickerItemHandle(item)),
        metaRow("Slot", option.slotLabel),
        metaRow("Category", blockPickerCategoryLabel(option)),
    );
    const insert = document.createElement("button");
    insert.className = "insert";
    insert.type = "button";
    insert.textContent = "Insert";
    insert.addEventListener("click", () => onSelect(option));
    container.append(preview, eyebrow, title, description, meta, insert);
}

export function renderBlockPickerOption(
    option: BlockPickerOption,
    activeOption: BlockPickerOption | null,
    onActivate: (option: BlockPickerOption) => void,
    onSelect: (option: BlockPickerOption) => void,
): HTMLElement {
    const button = document.createElement("button");
    button.className = "block";
    button.type = "button";
    button.ariaSelected = String(option === activeOption);
    button.addEventListener("click", () => onActivate(option));
    button.addEventListener("dblclick", () => onSelect(option));
    const item = blockPickerOptionItem(option);
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = blockPickerIconText(item);
    const body = document.createElement("span");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = blockPickerItemLabel(item);
    const description = document.createElement("span");
    description.className = "description";
    description.textContent = blockPickerItemDescription(item);
    const category = document.createElement("span");
    category.className = "category";
    category.textContent = blockPickerCategoryLabel(option);
    body.append(name, description, category);
    button.append(icon, body);
    return button;
}

export function renderBlockPickerTabs(
    container: HTMLElement,
    groups: BlockPickerSlotGroup[],
    activeSlotKey: string,
    onSelect: (slotKey: string) => void,
): void {
    container.replaceChildren();
    for (const group of groups) {
        const button = document.createElement("button");
        const slotKey = group.slot ?? "";
        button.className = "tab";
        button.type = "button";
        button.role = "tab";
        button.textContent = group.label;
        button.disabled = Boolean(group.disabledReason);
        button.ariaSelected = String(slotKey === activeSlotKey);
        if (group.disabledReason) {
            button.title = group.disabledReason;
        }
        button.addEventListener("click", () => {
            if (!button.disabled) {
                onSelect(slotKey);
            }
        });
        container.append(button);
    }
}

function metaRow(label: string, value: string): HTMLElement {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    return wrapper;
}
