import type { DataField } from "@bernouy/cms-content/editor";
import type { EditorDataSourceBodyField } from "../../../../runtime";

type RenderableField = {
    path: string;
    type?: string;
    required?: boolean;
    children?: RenderableField[];
};

export function renderDataSourceFields(fields: DataField[]): HTMLElement {
    return renderFieldList(fields, "No schema fields declared.");
}

export function renderDataSourceBodyFields(fields: EditorDataSourceBodyField[]): HTMLElement {
    return renderFieldList(fields, "No request body declared.");
}

function renderFieldList(fields: RenderableField[], emptyMessage: string): HTMLElement {
    const list = document.createElement("ul");
    list.className = "fields";

    for (const field of fields) {
        list.append(renderField(field, 0));
    }

    if (list.children.length === 0) {
        const empty = document.createElement("p");
        empty.className = "details-empty";
        empty.textContent = emptyMessage;
        return empty;
    }

    return list;
}

function renderField(field: RenderableField, depth: number): HTMLElement {
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

    if (field.required) {
        const required = document.createElement("span");
        required.className = "field-required";
        required.textContent = "required";
        item.append(required);
    }

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
