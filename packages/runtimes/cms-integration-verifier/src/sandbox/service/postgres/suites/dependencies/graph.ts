import { integrationVersionSatisfies, type IntegrationDefinition } from "@bernouy/cms-integrations";
import type { DependencyMatrixPlan, LoadedCandidatePackage, LoadedDependencyPackage } from "./types";

export function buildDependencyMatrixPlans(
    candidate: LoadedCandidatePackage,
    packages: readonly LoadedDependencyPackage[],
): readonly DependencyMatrixPlan[] {
    if (packages.length === 0) {
        return Object.freeze([]);
    }
    const grouped = new Map<"minimum" | "stable", LoadedDependencyPackage[]>([
        ["minimum", []],
        ["stable", []],
    ]);
    for (const entry of packages) {
        grouped.get(entry.selection)!.push(entry);
    }
    if (grouped.get("minimum")!.length === 0 || grouped.get("stable")!.length === 0) {
        throw new TypeError("Dependency package transport must contain both minimum and stable matrices");
    }
    return Object.freeze(
        (["minimum", "stable"] as const).map((selection) => ({
            selection,
            packages: topologicalPackages(candidate.definition, selection, grouped.get(selection)!),
        })),
    );
}

function topologicalPackages(
    candidate: IntegrationDefinition,
    selection: "minimum" | "stable",
    packages: readonly LoadedDependencyPackage[],
): readonly LoadedDependencyPackage[] {
    const byKind = new Map<string, LoadedDependencyPackage>();
    for (const entry of packages) {
        if (byKind.has(entry.kind)) {
            throw new TypeError(`Dependency ${selection} matrix selects ${entry.kind} more than once`);
        }
        byKind.set(entry.kind, entry);
    }
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const ordered: LoadedDependencyPackage[] = [];
    visitDefinition(candidate, selection, byKind, visiting, visited, ordered);
    if (visited.size !== packages.length) {
        throw new TypeError(`Dependency ${selection} matrix contains an unreachable package`);
    }
    return Object.freeze(ordered);
}

function visitDefinition(
    definition: IntegrationDefinition,
    selection: "minimum" | "stable",
    byKind: ReadonlyMap<string, LoadedDependencyPackage>,
    visiting: Set<string>,
    visited: Set<string>,
    ordered: LoadedDependencyPackage[],
): void {
    for (const dependency of [...(definition.dependencies ?? [])].toSorted((left, right) =>
        left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0,
    )) {
        const selected = byKind.get(dependency.kind);
        if (!selected) {
            if (dependency.optional) {
                continue;
            }
            throw new TypeError(`Dependency ${selection} matrix omits required ${dependency.kind}`);
        }
        if (dependency.versionRange && !integrationVersionSatisfies(selected.version, dependency.versionRange)) {
            throw new TypeError(`Dependency ${selection} matrix selects ${dependency.kind} outside its range`);
        }
        if (visited.has(selected.kind)) {
            continue;
        }
        if (visiting.has(selected.kind)) {
            throw new TypeError(`Dependency ${selection} matrix contains a cycle through ${selected.kind}`);
        }
        visiting.add(selected.kind);
        visitDefinition(selected.definition, selection, byKind, visiting, visited, ordered);
        visiting.delete(selected.kind);
        visited.add(selected.kind);
        ordered.push(selected);
    }
}
