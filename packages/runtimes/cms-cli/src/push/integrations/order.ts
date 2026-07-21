import type { IntegrationDefinition, IntegrationDependency } from "@bernouy/cms-integrations";
import type { ClassifiedIntegration } from "./classify";

export type IntegrationDefinitionLookup = ReadonlyMap<string, IntegrationDefinition>;

const isWrite = (entry: ClassifiedIntegration): boolean => entry.status === "new" || entry.status === "update";

/**
 * Return writable integrations in a stable dependency-first order.
 *
 * Dependencies that are not part of this write batch are already installed or
 * remain the server's responsibility to validate. Local optional dependencies
 * are preferred first, but remain non-blocking if their push fails.
 */
export function orderIntegrationWritesByDependencies(
    entries: readonly ClassifiedIntegration[],
    definitions: IntegrationDefinitionLookup = new Map(),
): ClassifiedIntegration[] {
    const writes = entries.filter(isWrite);
    const indexByKind = new Map<string, number>();
    for (let index = 0; index < writes.length; index++) {
        const kind = writes[index]!.integration.id;
        if (indexByKind.has(kind)) {
            throw new Error(`Duplicate writable integration kind "${kind}"`);
        }
        indexByKind.set(kind, index);
    }
    const declaredDependencies = writes.map((entry) => localDependencies(entry, indexByKind, definitions));
    const dependencySets = declaredDependencies.map(
        (items) => new Set(items.filter((item) => !item.optional).map((item) => item.index)),
    );

    for (let dependent = 0; dependent < declaredDependencies.length; dependent++) {
        for (const dependency of declaredDependencies[dependent]!) {
            if (!dependency.optional || dependencySets[dependent]!.has(dependency.index)) {
                continue;
            }
            if (!hasDependencyPath(dependency.index, dependent, dependencySets)) {
                dependencySets[dependent]!.add(dependency.index);
            }
        }
    }

    const dependencies = dependencySets.map((indexes) => [...indexes]);
    const dependents = dependencies.map(() => [] as number[]);
    const pendingDependencies = dependencies.map((items) => items.length);

    for (let dependent = 0; dependent < dependencies.length; dependent++) {
        for (const dependency of dependencies[dependent]!) {
            dependents[dependency]!.push(dependent);
        }
    }

    const ready = pendingDependencies
        .map((count, index) => ({ count, index }))
        .filter(({ count }) => count === 0)
        .map(({ index }) => index);
    const ordered: ClassifiedIntegration[] = [];

    while (ready.length > 0) {
        const index = ready.shift()!;
        ordered.push(writes[index]!);
        for (const dependent of dependents[index]!) {
            pendingDependencies[dependent] = pendingDependencies[dependent]! - 1;
            if (pendingDependencies[dependent] === 0) {
                insertSorted(ready, dependent);
            }
        }
    }

    if (ordered.length !== writes.length) {
        const cycle = findDependencyCycle(dependencies);
        const path = cycle.map((index) => writes[index]!.integration.id).join(" -> ");
        throw new Error(`Integration dependency cycle detected: ${path}`);
    }

    return ordered;
}

export function integrationDependencies(
    entry: ClassifiedIntegration,
    definitions: IntegrationDefinitionLookup = new Map(),
): readonly IntegrationDependency[] {
    const inlineDefinition = entry.integration.request.definition;
    if (inlineDefinition) {
        return inlineDefinition.dependencies ?? [];
    }
    return definitions.get(entry.integration.request.kind)?.dependencies ?? [];
}

function localDependencies(
    entry: ClassifiedIntegration,
    indexByKind: ReadonlyMap<string, number>,
    definitions: IntegrationDefinitionLookup,
): Array<{ index: number; optional: boolean }> {
    const dependencies = new Map<number, boolean>();
    for (const dependency of integrationDependencies(entry, definitions)) {
        const index = indexByKind.get(dependency.kind);
        if (index === undefined) {
            continue;
        }
        const optional = dependency.optional === true;
        dependencies.set(index, (dependencies.get(index) ?? true) && optional);
    }
    return [...dependencies].map(([index, optional]) => ({ index, optional }));
}

function hasDependencyPath(
    from: number,
    to: number,
    dependencies: readonly ReadonlySet<number>[],
    seen = new Set<number>(),
): boolean {
    if (from === to) {
        return true;
    }
    if (seen.has(from)) {
        return false;
    }
    seen.add(from);
    return [...dependencies[from]!].some((dependency) => hasDependencyPath(dependency, to, dependencies, seen));
}

function insertSorted(indexes: number[], value: number): void {
    const position = indexes.findIndex((index) => index > value);
    if (position === -1) {
        indexes.push(value);
    } else {
        indexes.splice(position, 0, value);
    }
}

function findDependencyCycle(dependencies: readonly number[][]): number[] {
    const states = dependencies.map(() => 0 as 0 | 1 | 2);
    const stack: number[] = [];

    const visit = (index: number): number[] | null => {
        states[index] = 1;
        stack.push(index);
        for (const dependency of dependencies[index]!) {
            if (states[dependency] === 0) {
                const cycle = visit(dependency);
                if (cycle) {
                    return cycle;
                }
            } else if (states[dependency] === 1) {
                return [...stack.slice(stack.indexOf(dependency)), dependency];
            }
        }
        stack.pop();
        states[index] = 2;
        return null;
    };

    for (let index = 0; index < dependencies.length; index++) {
        if (states[index] !== 0) {
            continue;
        }
        const cycle = visit(index);
        if (cycle) {
            return cycle;
        }
    }
    return [];
}
