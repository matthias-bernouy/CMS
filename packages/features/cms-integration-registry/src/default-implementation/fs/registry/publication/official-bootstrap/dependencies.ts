import { integrationVersionSatisfies, type IntegrationDefinition } from "@bernouy/cms-integrations";
import type { PreparedFsIntegrationRegistryCandidate } from "../candidate";

export function resolveBootstrapDependencies(
    candidate: PreparedFsIntegrationRegistryCandidate,
    packagesByKind: ReadonlyMap<string, PreparedFsIntegrationRegistryCandidate>,
): readonly PreparedFsIntegrationRegistryCandidate[] {
    const resolved: PreparedFsIntegrationRegistryCandidate[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    visit(candidate.definition, packagesByKind, visiting, visited, resolved);
    return Object.freeze(resolved);
}

function visit(
    definition: IntegrationDefinition,
    packagesByKind: ReadonlyMap<string, PreparedFsIntegrationRegistryCandidate>,
    visiting: Set<string>,
    visited: Set<string>,
    resolved: PreparedFsIntegrationRegistryCandidate[],
): void {
    const dependencies = [...(definition.dependencies ?? [])]
        .filter(({ optional }) => !optional)
        .sort((left, right) => compareText(left.kind, right.kind));
    for (const dependency of dependencies) {
        const selected = packagesByKind.get(dependency.kind);
        if (
            !selected ||
            (dependency.versionRange &&
                !integrationVersionSatisfies(selected.package.envelope.version, dependency.versionRange))
        ) {
            throw new TypeError(
                `Official bootstrap required dependency cannot be resolved: ${definition.kind} -> ${dependency.kind}`,
            );
        }
        const identity = `${selected.definition.kind}@${selected.package.envelope.version}`;
        if (visited.has(identity)) {
            continue;
        }
        if (visiting.has(identity)) {
            throw new TypeError(`Official bootstrap required dependency cycle includes ${identity}`);
        }
        visiting.add(identity);
        visit(selected.definition, packagesByKind, visiting, visited, resolved);
        visiting.delete(identity);
        visited.add(identity);
        resolved.push(selected);
    }
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
