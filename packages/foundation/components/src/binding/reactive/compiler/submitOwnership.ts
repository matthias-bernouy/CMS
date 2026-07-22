import { SOURCE_ATTR } from "../../core/attrs";
import { collectConditionReferences } from "../../render/condition";
import { parseSourceSpec } from "../../source/runtime/sourceSpec";
import type { SubmitSourceBoundary } from "../templatePlan";

const BINDING_TOKEN = /\{\{\s*([\w$.-]+)(?:\s*\|\s*(\w+))?\s*\}\}/g;

export function submitBoundary(element: Element): SubmitSourceBoundary {
    return { alias: parseSourceSpec(element.getAttribute(SOURCE_ATTR) ?? "").alias };
}

export function bindingOwnedBySubmitSource(value: string, boundary: SubmitSourceBoundary | null): boolean {
    if (!boundary) {
        return false;
    }
    BINDING_TOKEN.lastIndex = 0;
    for (const match of value.matchAll(BINDING_TOKEN)) {
        if (pathOwnedBySubmitSource(match[1] ?? "", boundary)) {
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
    return head === "$source" || (!!boundary.alias && head === boundary.alias);
}
