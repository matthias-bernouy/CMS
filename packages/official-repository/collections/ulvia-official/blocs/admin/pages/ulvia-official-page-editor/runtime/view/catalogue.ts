import type { EditableInsertionTarget, EditablePageDocument } from "../document/index";
import type { EditorCatalogueItem } from "../model";

export function renderCatalogue(
    target: HTMLElement,
    catalogue: EditorCatalogueItem[],
    query: string,
    insertion?: { document: EditablePageDocument; target: EditableInsertionTarget },
): void {
    target.replaceChildren();
    const normalized = query.trim().toLocaleLowerCase();
    for (const item of catalogue.filter(
        (candidate) =>
            matches(candidate, normalized) &&
            (!insertion || insertion.document.canInsert(candidate, insertion.target, catalogue)),
    )) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.add = item.id;
        const name = document.createElement("strong");
        name.textContent = item.name;
        const details = document.createElement("small");
        details.textContent = item.group;
        button.append(name, details);
        if (item.description) {
            const description = document.createElement("span");
            description.textContent = item.description;
            button.append(description);
        }
        target.append(button);
    }
    target.parentElement
        ?.querySelector<HTMLElement>("[data-catalogue-empty]")
        ?.toggleAttribute("hidden", target.childElementCount > 0);
}

function matches(item: EditorCatalogueItem, query: string): boolean {
    return !query || `${item.name} ${item.group} ${item.description} ${item.id}`.toLocaleLowerCase().includes(query);
}
