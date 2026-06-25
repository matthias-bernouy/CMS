import type { DynamicDataOption } from "./dynamicDataOptions";

export function matchingDynamicDataOptions(options: DynamicDataOption[], query: string): DynamicDataOption[] {
    const normalized = query.trim().toLowerCase();
    return normalized
        ? options.filter(option => `${option.label} ${option.path}`.toLowerCase().includes(normalized))
        : options;
}

export function renderDynamicDataOptions(
    list: HTMLElement,
    options: DynamicDataOption[],
    totalOptions: number,
    onSelect: (path: string) => void,
): void {
    list.replaceChildren();

    if (options.length === 0) {
        const empty = document.createElement("p");
        empty.className = "data-empty";
        empty.textContent = totalOptions === 0 ? "No data available here." : "No matching data.";
        list.append(empty);
        return;
    }

    for (const option of options) {
        const button = document.createElement("button");
        button.className = "data-option";
        button.type = "button";
        button.dataset.path = option.path;

        const label = document.createElement("span");
        label.className = "data-label";
        label.textContent = option.label;
        const path = document.createElement("code");
        path.textContent = option.path;

        button.append(label, path);
        button.addEventListener("click", () => onSelect(option.path));
        list.append(button);
    }
}
