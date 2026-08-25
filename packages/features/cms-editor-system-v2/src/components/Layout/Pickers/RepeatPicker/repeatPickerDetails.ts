import type { DataField } from "@bernouy/cms-content/editor";
import { defaultRepeatAlias, type RepeatOption } from "./repeatOptions";

export function renderRepeatOptions(
    container: HTMLElement,
    options: RepeatOption[],
    activeOption: RepeatOption | null,
    onActivate: (option: RepeatOption) => void,
    onSelect: (option: RepeatOption) => void,
): void {
    container.replaceChildren();
    if (options.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No array fields available.";
        container.append(empty);
        return;
    }
    for (const option of options) {
        const button = document.createElement("button");
        button.className = "array";
        button.type = "button";
        button.ariaSelected = String(option === activeOption);
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = option.path;
        const scope = document.createElement("span");
        scope.className = "scope";
        scope.textContent = option.scopeLabel;
        button.append(name, scope);
        button.addEventListener("click", () => onActivate(option));
        button.addEventListener("dblclick", () => onSelect(option));
        container.append(button);
    }
}

export function renderRepeatDetails(container: HTMLElement, option: RepeatOption | null): void {
    container.replaceChildren();
    if (!option) {
        const empty = document.createElement("div");
        empty.className = "details-empty";
        empty.textContent = "Select an array field to inspect item fields.";
        container.append(empty);
        return;
    }

    const heading = document.createElement("div");
    heading.className = "details-eyebrow";
    heading.textContent = "Response fields";
    container.append(heading, renderFields(option.fields));
}

export function renderRepeatBinding(
    container: HTMLElement,
    option: RepeatOption | null,
    onSelect: (option: RepeatOption, alias: string) => void,
): void {
    container.replaceChildren();
    if (!option) {
        const empty = document.createElement("div");
        empty.className = "details-empty";
        empty.textContent = "Select an array field to configure repeat.";
        container.append(empty);
        return;
    }

    const heading = document.createElement("div");
    heading.className = "details-eyebrow";
    heading.textContent = "Binding";

    const path = document.createElement("div");
    path.className = "repeat-path";
    const pathLabel = document.createElement("span");
    pathLabel.textContent = "Array";
    const pathValue = document.createElement("strong");
    pathValue.textContent = option.path;
    path.append(pathLabel, pathValue);

    const config = document.createElement("section");
    config.className = "binding-config";
    const label = document.createElement("label");
    label.textContent = "Alias";
    const alias = document.createElement("input");
    alias.className = "alias";
    alias.value = defaultRepeatAlias(option.path);
    label.append(alias);
    config.append(label);

    const insert = document.createElement("button");
    insert.className = "insert";
    insert.type = "button";
    insert.textContent = "Use repeat";
    insert.addEventListener("click", () => onSelect(option, alias.value));

    const scroll = document.createElement("div");
    scroll.className = "binding-scroll";
    scroll.append(heading, path, config);
    const footer = document.createElement("footer");
    footer.className = "binding-footer";
    footer.append(insert);
    container.append(scroll, footer);
}

function renderFields(fields: DataField[]): HTMLElement {
    const list = document.createElement("ul");
    list.className = "fields";
    for (const field of fields) {
        list.append(renderField(field, 0));
    }
    if (list.children.length === 0) {
        const empty = document.createElement("p");
        empty.className = "details-empty";
        empty.textContent = "No item fields declared.";
        return empty;
    }
    return list;
}

function renderField(field: DataField, depth: number): HTMLElement {
    const item = document.createElement("li");
    item.className = "field";
    item.style.setProperty("--field-depth", String(depth));

    const path = document.createElement("span");
    path.className = "field-path";
    path.textContent = field.path;
    const type = document.createElement("span");
    type.className = "field-type";
    type.textContent = field.type ?? "unknown";
    item.append(path, type);

    if (field.children?.length) {
        const children = document.createElement("ul");
        children.className = "field-children";
        for (const child of field.children) {
            children.append(renderField(child, depth + 1));
        }
        item.append(children);
    }
    return item;
}
