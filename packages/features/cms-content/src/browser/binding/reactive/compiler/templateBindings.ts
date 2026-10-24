import { bindingOwnedByMutation } from "./mutationOwnership";
import type { CompilePlan, MutationBoundary, NodePath } from "../templatePlan";
import { parseInterpolation } from "cms-content/blocs/core/markup/bindings/operation";
import { nativeAttributeBindingKind } from "cms-content/blocs/core/markup/bindings/platform/nativeAttributes";

export function compileAttributes(
    element: Element,
    path: NodePath,
    plan: CompilePlan,
    boundary: MutationBoundary | null,
): void {
    for (const attribute of Array.from(element.attributes)) {
        if (attribute.value.includes("{{") && !bindingOwnedByMutation(attribute.value, boundary)) {
            const expression = parseInterpolation(attribute.value) ?? undefined;
            plan.attributes.push({
                path,
                name: attribute.name,
                template: attribute.value,
                ...(expression ? { expression } : {}),
                kind: bindingKind(element, attribute.name),
            });
        }
    }
}

function bindingKind(element: Element, attribute: string): "boolean" | "string" | "auto" {
    if (attribute.startsWith("aria-")) {
        return "string";
    }
    return element.localName.includes("-") ? "auto" : nativeAttributeBindingKind(attribute);
}

const RAW_HTML = /^\{\{\s*([\w.]+)\s*\|\s*innerHTML\s*\}\}$/;

export function rawHtmlExpression(element: Element): string | null {
    const only = element.childNodes.length === 1 ? element.firstChild : null;
    if (!only || only.nodeType !== Node.TEXT_NODE) {
        return null;
    }
    return (only.nodeValue ?? "").trim().match(RAW_HTML)?.[1] ?? null;
}
