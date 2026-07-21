import {
    type ArchitectureViolation,
    type PackageManifest,
    WORKSPACE_LAYERS,
    type WorkspaceLayer,
    type WorkspacePackage,
} from "../core/architectureTypes";

export function checkManifestLayerDependencies(
    packages: readonly WorkspacePackage[],
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    violations: ArchitectureViolation[],
): void {
    for (const pkg of packages) {
        for (const dependency of workspaceDependencies(pkg.manifest)) {
            const target = packageByName.get(dependency);
            if (!target || layerRank(pkg.layer) >= layerRank(target.layer)) continue;
            violations.push({
                kind: "reversed-layer-dependency",
                file: `${pkg.relativeRoot}/package.json`,
                message: `${pkg.name} (${pkg.layer}) cannot depend on ${target.name} (${target.layer})`,
            });
        }
    }
}

export function checkWorkspaceCycles(
    packages: readonly WorkspacePackage[],
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    violations: ArchitectureViolation[],
): void {
    const edges = new Map<string, string[]>();
    for (const pkg of packages) {
        edges.set(pkg.name, workspaceDependencies(pkg.manifest).filter((name) => packageByName.has(name)));
    }
    const state = createCycleState();
    for (const pkg of packages) {
        if (!state.indexes.has(pkg.name)) visitDependency(pkg.name, edges, state, violations);
    }
}

interface CycleState {
    nextIndex: number;
    indexes: Map<string, number>;
    lowLinks: Map<string, number>;
    stack: string[];
    onStack: Set<string>;
}

function createCycleState(): CycleState {
    return {
        nextIndex: 0,
        indexes: new Map(),
        lowLinks: new Map(),
        stack: [],
        onStack: new Set(),
    };
}

function visitDependency(
    name: string,
    edges: ReadonlyMap<string, string[]>,
    state: CycleState,
    violations: ArchitectureViolation[],
): void {
    state.indexes.set(name, state.nextIndex);
    state.lowLinks.set(name, state.nextIndex);
    state.nextIndex += 1;
    state.stack.push(name);
    state.onStack.add(name);

    for (const target of edges.get(name) ?? []) {
        if (!state.indexes.has(target)) {
            visitDependency(target, edges, state, violations);
            state.lowLinks.set(name, Math.min(state.lowLinks.get(name)!, state.lowLinks.get(target)!));
        } else if (state.onStack.has(target)) {
            state.lowLinks.set(name, Math.min(state.lowLinks.get(name)!, state.indexes.get(target)!));
        }
    }
    if (state.lowLinks.get(name) !== state.indexes.get(name)) return;
    reportCycle(popComponent(name, state), edges, violations);
}

function popComponent(name: string, state: CycleState): string[] {
    const component: string[] = [];
    let popped: string;
    do {
        popped = state.stack.pop()!;
        state.onStack.delete(popped);
        component.push(popped);
    } while (popped !== name);
    return component;
}

function reportCycle(
    component: string[],
    edges: ReadonlyMap<string, string[]>,
    violations: ArchitectureViolation[],
): void {
    const selfCycle = component.length === 1 && (edges.get(component[0]!) ?? []).includes(component[0]!);
    if (component.length <= 1 && !selfCycle) return;
    violations.push({
        kind: "workspace-cycle",
        message: `workspace dependency cycle: ${component.sort().join(" -> ")}`,
    });
}

export function workspaceDependencies(manifest: PackageManifest): string[] {
    return [...new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
    ])].sort();
}

export function layerRank(layer: WorkspaceLayer): number {
    return WORKSPACE_LAYERS.indexOf(layer);
}
