import { IntegrationInputError } from "../errors";
import type { CollectionIntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type { CollectionResource, CollectionSelection } from "../../interfaces/IntegrationResources";
import { resolveCollectionDependencies } from "./dependencySelection";

export function collectionSelectableResources(definition: CollectionIntegrationDefinition): CollectionResource[] {
    const internalArtifacts = new Set(
        (definition.artifacts ?? [])
            .filter((artifact) => artifact.type === "bloc" && artifact.bloc.internal)
            .map((artifact) => artifact.bloc.tag),
    );
    return definition.resources.filter((resource) => !internalArtifacts.has(resource.artifact));
}

export function resolveCollectionSelection(
    definition: CollectionIntegrationDefinition,
    requested?: readonly string[],
    previous?: readonly string[],
    availableDefinitions: readonly IntegrationDefinition[] = [definition],
): CollectionSelection {
    const selectable = collectionSelectableResources(definition);
    const known = new Set(selectable.map(({ id }) => id));
    const removed = (previous ?? []).filter((id) => !known.has(id));
    if (removed.length) {
        throw new IntegrationInputError(
            "resources",
            `active collection resources were removed: ${removed.sort().join(", ")}`,
        );
    }
    const selected =
        requested ?? previous ?? selectable.filter(({ defaultActive }) => defaultActive).map(({ id }) => id);
    const activeResources = [...new Set(selected)];
    const unknown = activeResources.filter((id) => !known.has(id));
    if (unknown.length) {
        throw new IntegrationInputError("resources", `unknown collection resources: ${unknown.sort().join(", ")}`);
    }

    const dependencies = resolveCollectionDependencies(definition, activeResources, availableDefinitions);
    return {
        activeResources: activeResources.sort(),
        ...dependencies,
    };
}

export function collectionResourceIdsForCategories(
    definition: CollectionIntegrationDefinition,
    categories: readonly string[],
): string[] {
    const known = new Set(definition.resourceCategories.map(({ id }) => id));
    const unknown = [...new Set(categories)].filter((id) => !known.has(id));
    if (unknown.length) {
        throw new IntegrationInputError("categories", `unknown collection categories: ${unknown.sort().join(", ")}`);
    }
    const selected = new Set(categories);
    return collectionSelectableResources(definition)
        .filter(({ category }) => selected.has(category))
        .map(({ id }) => id);
}
