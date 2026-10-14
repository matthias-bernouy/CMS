import { bindingOwnedBySubmitSource } from "./submitOwnership";
import type { CompilePlan, NodePath, SubmitSourceBoundary } from "../templatePlan";
import { parseInterpolation } from "cms-content/blocs/core/markup/bindings";
import { nativeAttributeBindingKind } from "cms-content/blocs/core/validation/nativeHtml";

export function compileAttributes(
    element: Element,
    path: NodePath,
    plan: CompilePlan,
    boundary: SubmitSourceBoundary | null,
): void {
    for (const attribute of Array.from(element.attributes)) {
        if (attribute.value.includes("{{") && !bindingOwnedBySubmitSource(attribute.value, boundary)) {
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
