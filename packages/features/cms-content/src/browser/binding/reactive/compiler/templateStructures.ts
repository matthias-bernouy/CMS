import { CASE_ATTR, CONDITION_ATTR, MATCH_ATTR, REPEAT_ATTR } from "../../core/attrs";
import { parseCase } from "cms-content/blocs/core/markup/bindings";
import type { FilterMap } from "../../core/interpolate";
import { compileCondition } from "../../render/condition";
import { compileExpression } from "../../render/expression";
import { parseRepeat } from "../../render/repeat";
import { conditionOwnedByMutation, pathOwnedByMutation } from "./mutationOwnership";
import type { CompilePlan, MountableTemplate, MutationBoundary, NodePath, TemplateFactory } from "../templatePlan";

export function compileRepeat(
    element: Element,
    path: NodePath,
    options: { skipRepeat: boolean; mutationBoundary: MutationBoundary | null },
    plan: CompilePlan,
    filters: FilterMap,
    createTemplate: TemplateFactory,
): boolean {
    const value = element.getAttribute(REPEAT_ATTR) ?? "";
    if (
        options.skipRepeat ||
        !element.hasAttribute(REPEAT_ATTR) ||
        pathOwnedByMutation(value, options.mutationBoundary)
    ) {
        return false;
    }
    const condition = element.getAttribute(CONDITION_ATTR);
    const conditionOwned = condition ? conditionOwnedByMutation(condition, options.mutationBoundary) : false;
    plan.repeats.push({
        path,
        spec: parseRepeat(value),
        template: compileElementTemplate(element, filters, createTemplate, {
            removeRepeat: true,
            removeCondition: !!options.mutationBoundary && !!condition && !conditionOwned,
            mutationBoundary: options.mutationBoundary,
        }),
        rootCondition: conditionOwned || !condition ? null : compileCondition(condition, filters),
    });
    return true;
}

export function compileConditional(
    element: Element,
    path: NodePath,
    options: { skipCondition: boolean; mutationBoundary: MutationBoundary | null },
    plan: CompilePlan,
    filters: FilterMap,
    createTemplate: TemplateFactory,
): boolean {
    const value = element.getAttribute(CONDITION_ATTR) ?? "";
    if (
        options.skipCondition ||
        !element.hasAttribute(CONDITION_ATTR) ||
        conditionOwnedByMutation(value, options.mutationBoundary)
    ) {
        return false;
    }
    plan.conditions.push({
        path,
        condition: compileCondition(value, filters),
        template: compileElementTemplate(element, filters, createTemplate, {
            removeCondition: !!options.mutationBoundary,
            mutationBoundary: options.mutationBoundary,
        }),
    });
    return true;
}

export function compileMatch(
    element: Element,
    path: NodePath,
    plan: CompilePlan,
    filters: FilterMap,
    createTemplate: TemplateFactory,
): boolean {
    if (!element.hasAttribute(MATCH_ATTR)) {
        return false;
    }
    const cases = Array.from(element.children, (child) => {
        const value = parseCase(child.getAttribute(CASE_ATTR) ?? "");
        if (value === undefined) {
            throw new TypeError(
                `Invalid cms-case binding under cms-match="${element.getAttribute(MATCH_ATTR) ?? ""}" on <${child.localName}>`,
            );
        }
        const fragment = (element.ownerDocument ?? document).createDocumentFragment();
        const clone = child.cloneNode(true) as Element;
        clone.removeAttribute(CASE_ATTR);
        fragment.appendChild(clone);
        return { value, template: createTemplate(fragment, filters) };
    });
    plan.matches.push({
        path,
        expression: compileExpression(element.getAttribute(MATCH_ATTR) ?? "", filters),
        cases,
    });
    return true;
}

function compileElementTemplate(
    element: Element,
    filters: FilterMap,
    createTemplate: TemplateFactory,
    options: { removeRepeat?: boolean; removeCondition?: boolean; mutationBoundary?: MutationBoundary | null },
): MountableTemplate {
    const fragment = (element.ownerDocument ?? document).createDocumentFragment();
    const clone = element.cloneNode(true) as Element;
    if (options.removeRepeat) {
        clone.removeAttribute(REPEAT_ATTR);
    }
    if (options.removeCondition) {
        clone.removeAttribute(CONDITION_ATTR);
    }
    fragment.appendChild(clone);
    return createTemplate(fragment, filters, {
        skipRootCondition: true,
        skipRootRepeat: options.removeRepeat === true,
        mutationBoundary: options.mutationBoundary ?? null,
    });
}
