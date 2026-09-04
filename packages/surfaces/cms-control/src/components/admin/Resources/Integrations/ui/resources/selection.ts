import {
    collectionSelectableResources,
    type CollectionIntegrationDefinition,
} from "@bernouy/cms-integrations/resources";

export function renderCollectionSelection(
    root: HTMLElement,
    definition: CollectionIntegrationDefinition,
    selected?: readonly string[],
): void {
    root.hidden = false;
    const resources = collectionSelectableResources(definition);
    const active = new Set(selected ?? resources.filter(({ defaultActive }) => defaultActive).map(({ id }) => id));
    const artifacts = new Map((definition.artifacts ?? []).map(({ bloc }) => [bloc.tag, bloc]));
    for (const category of definition.resourceCategories) {
        const categoryResources = resources.filter((resource) => resource.category === category.id);
        if (!categoryResources.length) {
            continue;
        }
        const fieldset = document.createElement("fieldset");
        fieldset.className = "collection-category";
        const legend = document.createElement("legend");
        legend.append(
            toggle(
                category.label,
                "category",
                category.id,
                categoryResources.every(({ id }) => active.has(id)),
            ),
        );
        fieldset.append(legend);
        for (const resource of categoryResources) {
            const artifact = artifacts.get(resource.artifact);
            const label = toggle(artifact?.name ?? resource.artifact, "resource", resource.id, active.has(resource.id));
            label.classList.add("collection-resource");
            if (resource.endpoints?.length) {
                const hint = document.createElement("small");
                hint.textContent = `Requires ${[...new Set(resource.endpoints.map(({ source }) => source))].join(", ")}`;
                label.append(hint);
            }
            fieldset.append(label);
        }
        root.append(fieldset);
    }
    updateCollectionPlan(root, definition);
}

export function handleCollectionSelection(target: Element, definition: CollectionIntegrationDefinition): boolean {
    const category = target.closest<HTMLInputElement>("[data-collection-category]");
    const resource = target.closest<HTMLInputElement>("[data-collection-resource]");
    if (!category && !resource) {
        return false;
    }
    const root = target.closest<HTMLElement>("[data-collection-selection]");
    if (!root) {
        return true;
    }
    if (category) {
        for (const input of Array.from(root.querySelectorAll<HTMLInputElement>("[data-collection-resource]"))) {
            const definitionResource = definition.resources.find(({ id }) => id === input.dataset.collectionResource);
            if (definitionResource?.category === category.dataset.collectionCategory) {
                input.checked = category.checked;
            }
        }
    }
    syncCategoryToggles(root, definition);
    updateCollectionPlan(root, definition);
    return true;
}

export function selectedCollectionResources(root: ParentNode): string[] {
    return Array.from(root.querySelectorAll<HTMLInputElement>("[data-collection-resource]:checked"))
        .map(({ dataset }) => dataset.collectionResource!)
        .sort();
}

function updateCollectionPlan(root: HTMLElement, definition: CollectionIntegrationDefinition): void {
    const plan = root.querySelector<HTMLElement>("[data-collection-source-plan]");
    if (!plan) {
        return;
    }
    const selected = new Set(selectedCollectionResources(root));
    const sources = new Map<string, string>();
    for (const resource of collectionSelectableResources(definition).filter(({ id }) => selected.has(id))) {
        for (const endpoint of resource.endpoints ?? []) {
            sources.set(endpoint.source, endpoint.sourceVersion);
        }
    }
    plan.textContent = sources.size
        ? `Required sources: ${[...sources].map(([kind, version]) => `${kind} ${version}`).join(", ")}`
        : "This selection does not require a source integration.";
}

function syncCategoryToggles(root: HTMLElement, definition: CollectionIntegrationDefinition): void {
    for (const input of Array.from(root.querySelectorAll<HTMLInputElement>("[data-collection-category]"))) {
        const ids = collectionSelectableResources(definition)
            .filter(({ category }) => category === input.dataset.collectionCategory)
            .map(({ id }) => id);
        const selected = new Set(selectedCollectionResources(root));
        input.checked = ids.every((id) => selected.has(id));
        input.indeterminate = !input.checked && ids.some((id) => selected.has(id));
    }
}

function toggle(labelText: string, kind: "category" | "resource", id: string, checked: boolean): HTMLLabelElement {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.dataset[kind === "category" ? "collectionCategory" : "collectionResource"] = id;
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(input, text);
    return label;
}
