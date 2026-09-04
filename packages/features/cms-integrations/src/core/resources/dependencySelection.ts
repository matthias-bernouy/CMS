import { IntegrationInputError } from "../errors";
import { integrationVersionSatisfies } from "../definitions/versioning";
import type { CollectionIntegrationDefinition, IntegrationDefinition } from "../../interfaces/Integration";
import type { CollectionSelection } from "../../interfaces/IntegrationResources";

type DependencySelection = Omit<CollectionSelection, "activeResources">;

export function resolveCollectionDependencies(
    root: CollectionIntegrationDefinition,
    resources: readonly string[],
    availableDefinitions: readonly IntegrationDefinition[],
): DependencySelection {
    const collections = collectionMap(root, availableDefinitions);
    const effective = new Map<string, Set<string>>();
    const requiredCollections = new Map<string, { version: string; resources: Set<string> }>();
    const requiredSources = new Map<string, string>();
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (kind: string, resourceId: string): void => {
        const key = `${kind}:${resourceId}`;
        if (visiting.has(key)) {
            return;
        }
        if (visited.has(key)) {
            return;
        }
        const collection = collections.get(kind);
        const resource = collection?.resources.find(({ id }) => id === resourceId);
        if (!collection || !resource) {
            throw new IntegrationInputError("resources", `required collection resource "${resourceId}" is unavailable`);
        }
        visiting.add(key);
        addToSetMap(effective, kind, resourceId);
        for (const endpoint of resource.endpoints ?? []) {
            const current = requiredSources.get(endpoint.source);
            if (current && current !== endpoint.sourceVersion) {
                throw new IntegrationInputError(
                    `resources.${resource.id}.endpoints`,
                    `uses conflicting source ranges for "${endpoint.source}": ${current} and ${endpoint.sourceVersion}`,
                );
            }
            requiredSources.set(endpoint.source, endpoint.sourceVersion);
        }
        for (const requiredResource of resource.requires?.resources ?? []) {
            visit(kind, requiredResource);
        }
        for (const requirement of resource.requires?.collections ?? []) {
            const target = collections.get(requirement.kind);
            if (!target?.version || !integrationVersionSatisfies(target.version, requirement.versionRange)) {
                throw new IntegrationInputError(
                    `resources.${resource.id}.requires.collections.${requirement.kind}`,
                    `required collection "${requirement.kind}" at ${requirement.versionRange} is unavailable`,
                );
            }
            const selected = requiredCollections.get(requirement.kind) ?? {
                version: target.version,
                resources: new Set<string>(),
            };
            for (const requiredResource of requirement.resources) {
                selected.resources.add(requiredResource);
                visit(requirement.kind, requiredResource);
            }
            requiredCollections.set(requirement.kind, selected);
        }
        visiting.delete(key);
        visited.add(key);
    };

    for (const resource of resources) {
        visit(root.kind, resource);
    }
    return {
        effectiveResources: [...effective]
            .map(([kind, ids]) => ({ kind, resources: [...ids].sort() }))
            .sort((left, right) => left.kind.localeCompare(right.kind)),
        requiredCollections: [...requiredCollections]
            .filter(([kind]) => kind !== root.kind)
            .map(([kind, value]) => ({ kind, version: value.version, resources: [...value.resources].sort() }))
            .sort((left, right) => left.kind.localeCompare(right.kind)),
        requiredSources: [...requiredSources]
            .map(([kind, versionRange]) => ({ kind, versionRange }))
            .sort((left, right) => left.kind.localeCompare(right.kind)),
    };
}

function collectionMap(
    root: CollectionIntegrationDefinition,
    definitions: readonly IntegrationDefinition[],
): Map<string, CollectionIntegrationDefinition> {
    const collections = new Map<string, CollectionIntegrationDefinition>();
    for (const definition of definitions) {
        if (definition.schema === "cms.integration.definition.v2" && definition.type === "collection") {
            collections.set(definition.kind, definition);
        }
    }
    collections.set(root.kind, root);
    return collections;
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
    const values = map.get(key) ?? new Set<string>();
    values.add(value);
    map.set(key, values);
}
