import { satisfiesVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { ContractSelectionDependency } from "../interfaces/ContractSelectionPlan";
import { ContractSelectionValidationError } from "./errors";
import type { ResolvedSelection } from "./resolveSelections";

export function selectionDependencies(
    resolved: ReadonlyMap<string, ResolvedSelection>,
    maximum: number,
): readonly ContractSelectionDependency[] {
    const dependencies: ContractSelectionDependency[] = [];
    const add = (dependency: Omit<ContractSelectionDependency, "present">) => {
        if (dependencies.length >= maximum) {
            throw new ContractSelectionValidationError("limit_exceeded", "too many selection dependencies");
        }
        dependencies.push({ ...dependency, present: resolved.has(dependency.contractId) });
    };
    for (const [contractId, node] of resolved) {
        for (const capability of node.release.capabilities) {
            for (const requirement of capability.requires ?? []) {
                add({
                    contractId: requirement.contractId,
                    capabilityId: requirement.capabilityId,
                    versionRange: requirement.versionRange,
                    source: "contract",
                    fromContractId: contractId,
                    fromCapabilityId: capability.id,
                    optional: false,
                });
            }
        }
        for (const requirement of node.implementation.requires) {
            add({ ...requirement, source: "implementation", fromContractId: contractId });
        }
    }
    return dependencies;
}

export function validateSelectionGraph(
    resolved: ReadonlyMap<string, ResolvedSelection>,
    dependencies: readonly ContractSelectionDependency[],
): void {
    const edges = new Map<string, ContractSelectionDependency[]>();
    for (const dependency of dependencies) {
        const list = edges.get(dependency.fromContractId) ?? [];
        list.push(dependency);
        edges.set(dependency.fromContractId, list);
    }
    const active = new Set<string>();
    const visited = new Set<string>();
    const walk = (contractId: string, ancestors: readonly string[]) => {
        const path = [...ancestors, contractId];
        if (active.has(contractId)) {
            throw new ContractSelectionValidationError(
                "dependency_cycle",
                "selection graph contains a cycle",
                "$",
                path,
            );
        }
        if (visited.has(contractId)) {
            return;
        }
        active.add(contractId);
        for (const dependency of edges.get(contractId) ?? []) {
            const target = resolved.get(dependency.contractId);
            if (!target && dependency.optional) {
                continue;
            }
            const dependencyPath = [...path, `${dependency.contractId}:${dependency.capabilityId}`];
            if (!target) {
                throw new ContractSelectionValidationError(
                    "missing_dependency",
                    `required capability ${dependency.capabilityId} has no selected contract`,
                    "$",
                    dependencyPath,
                );
            }
            if (
                !target.release.capabilities.some((capability) => capability.id === dependency.capabilityId) ||
                !satisfiesVersionRange(target.selection.version, dependency.versionRange)
            ) {
                throw new ContractSelectionValidationError(
                    "incompatible_dependency",
                    `selected ${target.selection.version} must provide ${dependency.capabilityId} in ${dependency.versionRange}`,
                    "$",
                    dependencyPath,
                );
            }
            walk(dependency.contractId, path);
        }
        active.delete(contractId);
        visited.add(contractId);
    };
    for (const contractId of resolved.keys()) {
        walk(contractId, []);
    }
}
