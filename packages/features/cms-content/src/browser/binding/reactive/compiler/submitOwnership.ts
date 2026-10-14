import { MUTATION_ATTR } from "../../core/attrs";
import { collectConditionReferences } from "../../render/condition";
import type { SubmitSourceBoundary } from "../templatePlan";
import { interpolationExpressions, parseMutation } from "cms-content/blocs/core/markup/bindings";

export function submitBoundary(element: Element): SubmitSourceBoundary {
    return {
        alias: parseMutation(element.getAttribute(MUTATION_ATTR) ?? "")?.name,
    };
}

export function bindingOwnedBySubmitSource(value: string, boundary: SubmitSourceBoundary | null): boolean {
    if (!boundary) {
        return false;
    }
    for (const expression of interpolationExpressions(value) ?? []) {
        if (collectConditionReferences(expression).some((path) => pathOwnedBySubmitSource(path, boundary))) {
            return true;
        }
    }
    return false;
}

export function conditionOwnedBySubmitSource(value: string, boundary: SubmitSourceBoundary | null): boolean {
    if (!boundary) {
        return false;
    }
    return collectConditionReferences(value).some((path) => pathOwnedBySubmitSource(path, boundary));
}

export function pathOwnedBySubmitSource(path: string, boundary: SubmitSourceBoundary | null): boolean {
    if (!boundary) {
        return false;
    }
    const head = path.trim().split(".")[0] ?? "";
    return !!boundary.alias && head === boundary.alias;
}
