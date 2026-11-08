import { BINDING_CORE_TAG, MUTATION_ATTR, QUERIES_ATTR, QUERY_ATTR } from "../../core/attrs";
import type { FilterMap } from "../../core/interpolate";
import { bindingOwnedByMutation, mutationBoundary, pathOwnedByMutation } from "./mutationOwnership";
import { compileAttributes, rawHtmlExpression } from "./templateBindings";
import type { CompileOptions, CompilePlan, MutationBoundary, NodePath, TemplateFactory } from "../templatePlan";
import { compileConditional, compileMatch, compileRepeat } from "./templateStructures";

export function compileTemplatePlan(
    fragment: DocumentFragment,
    filters: FilterMap,
    options: CompileOptions,
    createTemplate: TemplateFactory,
): CompilePlan {
    const plan: CompilePlan = { text: [], attributes: [], conditions: [], repeats: [], rawHtml: [], matches: [] };
    Array.from(fragment.childNodes).forEach((child, index) => {
        compileNode(
            child,
            [index],
            {
                skipCondition: options.skipRootCondition === true,
                skipRepeat: options.skipRootRepeat === true,
                mutationBoundary: options.mutationBoundary ?? null,
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
    options: { skipCondition: boolean; skipRepeat: boolean; mutationBoundary: MutationBoundary | null },
    plan: CompilePlan,
    filters: FilterMap,
    createTemplate: TemplateFactory,
): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const template = node.nodeValue ?? "";
        if (template.includes("{{") && !bindingOwnedByMutation(template, options.mutationBoundary)) {
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
    if (compileMatch(element, path, plan, filters, createTemplate)) {
        return;
    }

    if (element.hasAttribute(QUERY_ATTR) || element.hasAttribute(QUERIES_ATTR)) {
        compileAttributes(element, path, plan, options.mutationBoundary);
        return;
    }
    if (element.hasAttribute(MUTATION_ATTR)) {
        const boundary = mutationBoundary(element);
        compileAttributes(element, path, plan, boundary);
        compileChildren(element, path, plan, filters, createTemplate, boundary);
        return;
    }
    if (element.localName === BINDING_CORE_TAG) {
        compileAttributes(element, path, plan, options.mutationBoundary);
        return;
    }

    const rawHtml = rawHtmlExpression(element);
    if (rawHtml) {
        if (!pathOwnedByMutation(rawHtml, options.mutationBoundary)) {
            plan.rawHtml.push({ path, expression: rawHtml });
        }
        return;
    }

    compileAttributes(element, path, plan, options.mutationBoundary);
    compileChildren(element, path, plan, filters, createTemplate, options.mutationBoundary);
}

function compileChildren(
    element: Element,
    path: NodePath,
    plan: CompilePlan,
    filters: FilterMap,
    createTemplate: TemplateFactory,
    boundary: MutationBoundary | null,
): void {
    Array.from(element.childNodes).forEach((child, index) => {
        compileNode(
            child,
            [...path, index],
            { skipCondition: false, skipRepeat: false, mutationBoundary: boundary },
            plan,
            filters,
            createTemplate,
        );
    });
}
