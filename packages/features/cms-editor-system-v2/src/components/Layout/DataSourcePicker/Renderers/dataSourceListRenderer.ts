import type { EditorDataSource } from "../../../../runtime";
import type { DataSourceProviderGroup } from "../State/dataSourceGroups";

export function renderProviderButtons(
    container: HTMLElement,
    groups: DataSourceProviderGroup[],
    activeProvider: string,
    onSelect: (provider: string) => void,
): void {
    container.replaceChildren();

    if (groups.length === 0) {
        container.append(empty("No sources available."));
        return;
    }

    for (const group of groups) {
        const button = document.createElement("button");
        button.className = "provider";
        button.type = "button";
        button.ariaPressed = String(group.key === activeProvider);
        button.innerHTML = `<span>${escapeHtml(group.label)}</span><span class="count">${group.count}</span>`;
        button.addEventListener("click", () => onSelect(group.key));
        container.append(button);
    }
}

export function renderSourceButtons(
    container: HTMLElement,
    sources: EditorDataSource[],
    activeSource: EditorDataSource | null,
    onSelect: (source: EditorDataSource) => void,
    onConfirm: (source: EditorDataSource) => void,
): void {
    container.replaceChildren();

    if (sources.length === 0) {
        container.append(empty("No matching sources."));
        return;
    }

    for (const source of sources) {
        const button = document.createElement("button");
        button.className = "source";
        button.type = "button";
        button.ariaSelected = String(source === activeSource);

        const header = document.createElement("span");
        header.className = "source-header";
        const method = document.createElement("span");
        method.className = "method";
        method.textContent = source.method ?? "GET";
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = source.label;
        header.append(method, name);
        const description = document.createElement("span");
        description.className = "description";
        description.textContent = source.description ?? "No description.";
        const url = document.createElement("span");
        url.className = "url";
        url.textContent = source.url;

        button.append(header, description, url);
        button.addEventListener("click", () => onSelect(source));
        button.addEventListener("dblclick", () => onConfirm(source));
        container.append(button);
    }
}

function empty(message: string): HTMLElement {
    const element = document.createElement("div");
    element.className = "empty";
    element.textContent = message;
    return element;
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
