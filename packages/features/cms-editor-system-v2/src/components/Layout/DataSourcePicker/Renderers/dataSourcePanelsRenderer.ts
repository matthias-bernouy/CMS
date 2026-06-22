import type { EditorDataSource } from "../../../../runtime";
import type { DataSourcePickerSourceBinding } from "../Binding/dataSourceBinding";
import { renderBindingConfig } from "../Binding/dataSourceBindingRenderer";
import { renderDataSourceFields } from "./dataSourceFieldRenderer";

export function renderDetailsPanel(container: HTMLElement, source: EditorDataSource | null): void {
    container.replaceChildren();

    if (!source) {
        container.append(detailsEmpty("Select a source to inspect its schema."));
        return;
    }

    const heading = document.createElement("div");
    heading.className = "details-eyebrow";
    heading.textContent = "Response fields";
    container.append(heading, renderDataSourceFields(source.fields));
}

export function renderBindingPanel(
    container: HTMLElement,
    source: EditorDataSource | null,
    options: {
        canRemove: boolean;
        initialBinding: DataSourcePickerSourceBinding | null;
        onSelect: () => void;
        onRemove: () => void;
    },
): void {
    container.replaceChildren();

    if (!source) {
        container.append(detailsEmpty("Select a source to configure its binding."));
        return;
    }

    const title = document.createElement("div");
    title.className = "config-heading";
    title.textContent = "Binding";
    const scroll = document.createElement("div");
    scroll.className = "binding-scroll";
    scroll.append(title, renderBindingConfig(source, options.initialBinding));

    const footer = document.createElement("footer");
    footer.className = "binding-footer";
    if (options.canRemove) footer.append(removeButton(options.onRemove));
    footer.append(insertButton(options.onSelect));
    container.append(scroll, footer);
}

function detailsEmpty(message: string): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "details-empty";
    empty.textContent = message;
    return empty;
}

function insertButton(onSelect: () => void): HTMLButtonElement {
    const insert = document.createElement("button");
    insert.className = "insert";
    insert.type = "button";
    insert.textContent = "Use source";
    insert.addEventListener("click", onSelect);
    return insert;
}

function removeButton(onRemove: () => void): HTMLButtonElement {
    const remove = document.createElement("button");
    remove.className = "remove-source";
    remove.type = "button";
    remove.textContent = "Remove source";
    remove.addEventListener("click", onRemove);
    return remove;
}
