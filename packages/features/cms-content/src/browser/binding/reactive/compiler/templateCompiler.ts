import { BINDING_CORE_TAG, SOURCE_ATTR, SOURCE_TRIGGER_ATTR } from "../../core/attrs";
import type { FilterMap } from "../../core/interpolate";
import { bindingOwnedBySubmitSource, pathOwnedBySubmitSource, submitBoundary } from "./submitOwnership";
import { compileAttributes, rawHtmlExpression } from "./templateBindings";
import type { CompileOptions, CompilePlan, NodePath, SubmitSourceBoundary, TemplateFactory } from "../templatePlan";
import { compileConditional, compileRepeat } from "./templateStructures";

export function compileTemplatePlan(
    fragment: DocumentFragment,
    filters: FilterMap,
    options: CompileOptions,
    createTemplate: TemplateFactory,
): CompilePlan {
    const plan: CompilePlan = { text: [], attributes: [], conditions: [], repeats: [], rawHtml: [] };
    Array.from(fragment.childNodes).forEach((child, index) => {
        compileNode(
            child,
            [index],
            {
                skipCondition: options.skipRootCondition === true,
                skipRepeat: options.skipRootRepeat === true,
                submitBoundary: options.submitBoundary ?? null,
            },
            plan,
            filters,
            createTemplate,
        );
    });
    return plan;
}

function compileNode(
    node: Node,
    path: NodePath,
    options: { skipCondition: boolean; skipRepeat: boolean; submitBoundary: SubmitSourceBoundary | null },
    plan: CompilePlan,
    filters: FilterMap,
    createTemplate: TemplateFactory,
): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const template = node.nodeValue ?? "";
        if (template.includes("{{") && !bindingOwnedBySubmitSource(template, options.submitBoundary)) {
            plan.text.push({ path, template });
        }
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
    }

    const element = node as Element;
    if (compileRepeat(element, path, options, plan, filters, createTemplate)) {
        return;
    }
    if (compileConditional(element, path, options, plan, filters, createTemplate)) {
        return;
    }

    if (element.hasAttribute(SOURCE_ATTR)) {
        const trigger = element.getAttribute(SOURCE_TRIGGER_ATTR)?.trim().toLowerCase();
        const boundary = trigger === "submit" || trigger === "change" ? submitBoundary(element) : null;
        compileAttributes(element, path, plan, boundary ?? options.submitBoundary);
        if (trigger === "submit" || trigger === "change") {
            compileChildren(element, path, plan, filters, createTemplate, boundary);
        }
        return;
    }
    if (element.localName === BINDING_CORE_TAG) {
        compileAttributes(element, path, plan, options.submitBoundary);
        return;
    }

    const rawHtml = rawHtmlExpression(element);
    if (rawHtml) {
        if (!pathOwnedBySubmitSource(rawHtml, options.submitBoundary)) {
            plan.rawHtml.push({ path, expression: rawHtml });
        }
        return;
    }

    compileAttributes(element, path, plan, options.submitBoundary);
    compileChildren(element, path, plan, filters, createTemplate, options.submitBoundary);
}

function compileChildren(
    element: Element,
    path: NodePath,
    plan: CompilePlan,
    filters: FilterMap,
    createTemplate: TemplateFactory,
    boundary: SubmitSourceBoundary | null,
): void {
    Array.from(element.childNodes).forEach((child, index) => {
        compileNode(
            child,
            [...path, index],
            { skipCondition: false, skipRepeat: false, submitBoundary: boundary },
            plan,
            filters,
            createTemplate,
        );
    });
}
