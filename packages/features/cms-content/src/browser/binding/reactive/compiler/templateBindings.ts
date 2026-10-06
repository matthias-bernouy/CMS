import { bindingOwnedBySubmitSource, pathOwnedBySubmitSource } from "./submitOwnership";
import type { CompilePlan, NodePath, SubmitSourceBoundary } from "../templatePlan";

export function compileAttributes(
    element: Element,
    path: NodePath,
    plan: CompilePlan,
    boundary: SubmitSourceBoundary | null,
): void {
    for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.startsWith("cms-bind-boolean-")) {
            const name = attribute.name.slice("cms-bind-boolean-".length);
            if (
                /^[a-z][a-z0-9-]*$/.test(name) &&
                /^[\w$.-]+$/.test(attribute.value) &&
                !pathOwnedBySubmitSource(attribute.value, boundary)
            ) {
                plan.attributes.push({ path, name, template: attribute.value, boolean: true });
            }
            continue;
        }
        if (attribute.value.includes("{{") && !bindingOwnedBySubmitSource(attribute.value, boundary)) {
            plan.attributes.push({ path, name: attribute.name, template: attribute.value });
        }
    }
}

const RAW_HTML = /^\{\{\s*([\w.]+)\s*\|\s*innerHTML\s*\}\}$/;

export function rawHtmlExpression(element: Element): string | null {
    const only = element.childNodes.length === 1 ? element.firstChild : null;
    if (!only || only.nodeType !== Node.TEXT_NODE) {
        return null;
    }
    return (only.nodeValue ?? "").trim().match(RAW_HTML)?.[1] ?? null;
}
