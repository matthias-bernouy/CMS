import type { DataField } from "@bernouy/cms-content/editor";

export function renderDataSourceFields(fields: DataField[]): HTMLElement {
    const list = document.createElement("ul");
    list.className = "fields";

    for (const field of fields) list.append(renderDataSourceField(field, 0));

    if (list.children.length === 0) {
        const empty = document.createElement("p");
        empty.className = "details-empty";
        empty.textContent = "No schema fields declared.";
        return empty;
    }

    return list;
}

function renderDataSourceField(field: DataField, depth: number): HTMLElement {
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
        for (const child of field.children) children.append(renderDataSourceField(child, depth + 1));
        item.append(children);
    }

    return item;
}
