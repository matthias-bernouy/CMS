import { MUTATION_ATTR } from "../../core/attrs";
import { collectConditionReferences } from "../../render/condition";
import type { MutationBoundary } from "../templatePlan";
import { interpolationExpressions, parseMutation } from "cms-content/blocs/core/markup/bindings";

export function mutationBoundary(element: Element): MutationBoundary {
    return {
        alias: parseMutation(element.getAttribute(MUTATION_ATTR) ?? "")?.name,
    };
}

export function bindingOwnedByMutation(value: string, boundary: MutationBoundary | null): boolean {
    if (!boundary) {
        return false;
    }
    for (const expression of interpolationExpressions(value) ?? []) {
        if (collectConditionReferences(expression).some((path) => pathOwnedByMutation(path, boundary))) {
            return true;
        }
    }
    return false;
}

export function conditionOwnedByMutation(value: string, boundary: MutationBoundary | null): boolean {
    if (!boundary) {
        return false;
    }
    return collectConditionReferences(value).some((path) => pathOwnedByMutation(path, boundary));
}

export function pathOwnedByMutation(path: string, boundary: MutationBoundary | null): boolean {
    if (!boundary) {
        return false;
    }
    const head = path.trim().split(".")[0] ?? "";
    return !!boundary.alias && head === boundary.alias;
}
