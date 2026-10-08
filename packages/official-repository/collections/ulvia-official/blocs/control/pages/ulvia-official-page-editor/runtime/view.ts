import { authoringContract, displayLabel, type EditorCatalogueItem, type EditorSetting } from "./model";

export function renderCatalogue(target: HTMLElement, catalogue: EditorCatalogueItem[], query: string): void {
    target.replaceChildren();
    const normalized = query.trim().toLocaleLowerCase();
    for (const item of catalogue.filter((candidate) => matches(candidate, normalized))) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.add = item.id;
        button.setAttribute("aria-label", `Add ${item.name}`);
        const name = document.createElement("strong");
        name.textContent = item.name;
        const details = document.createElement("small");
        details.textContent = `${item.group} · ${item.kind}`;
        button.append(name, details);
        target.append(button);
    }
    if (!target.childElementCount) {
        target.textContent = "No matching Blocs.";
    }
}

export function renderOutline(
    target: HTMLOListElement,
    elements: HTMLElement[],
    catalogue: EditorCatalogueItem[],
    selected: number,
): void {
    target.replaceChildren();
    for (const [index, element] of elements.entries()) {
        const item = itemForElement(element, catalogue);
        const row = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.select = String(index);
        button.setAttribute("aria-current", String(index === selected));
        button.textContent = `${index + 1}. ${item?.name ?? displayLabel(element.localName)}`;
        row.append(button);
        target.append(row);
    }
}

export function renderSettings(target: HTMLElement, element: HTMLElement, item?: EditorCatalogueItem): void {
    target.replaceChildren();
    for (const setting of item ? (authoringContract(item).settings ?? []) : []) {
        target.append(settingControl(element, setting));
    }
}

export function itemForElement(
    element: HTMLElement,
    catalogue: EditorCatalogueItem[],
): EditorCatalogueItem | undefined {
    return catalogue.find((item) => {
        const nativeTags = authoringContract(item).nativeElement?.accepts ?? [];
        return item.id === element.localName || nativeTags.includes(element.localName);
    });
}

function matches(item: EditorCatalogueItem, query: string): boolean {
    return !query || `${item.name} ${item.group} ${item.description} ${item.id}`.toLocaleLowerCase().includes(query);
}

function settingControl(element: HTMLElement, setting: EditorSetting): HTMLLabelElement {
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = displayLabel(setting.id);
    label.append(caption);
    if (setting.type === "boolean") {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = element.hasAttribute(setting.id);
        input.dataset.setting = setting.id;
        input.dataset.settingType = setting.type;
        label.append(input);
        return label;
    }
    const options = setting.control?.options ?? [];
    const control = options.length ? document.createElement("select") : document.createElement("input");
    control.dataset.setting = setting.id;
    control.dataset.settingType = setting.type;
    if (control instanceof HTMLSelectElement) {
        for (const optionDefinition of options) {
            const option = document.createElement("option");
            option.value = optionDefinition.value;
            option.textContent = displayLabel(optionDefinition.value);
            control.append(option);
        }
    } else {
        control.type = setting.type === "integer" || setting.type === "number" ? "number" : "text";
    }
    control.value = element.getAttribute(setting.id) ?? String(setting.default ?? "");
    label.append(control);
    return label;
}
