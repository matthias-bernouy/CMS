import { CONDITION_ATTR, REPEAT_ATTR } from "../../core/attrs";
import type { FilterMap } from "../../core/interpolate";
import { compileCondition } from "../../render/condition";
import { parseRepeat } from "../../render/repeat";
import { conditionOwnedBySubmitSource, pathOwnedBySubmitSource } from "./submitOwnership";
import type { CompilePlan, MountableTemplate, NodePath, SubmitSourceBoundary, TemplateFactory } from "../templatePlan";

export function compileRepeat(
    element: Element,
    path: NodePath,
    options: { skipRepeat: boolean; submitBoundary: SubmitSourceBoundary | null },
    plan: CompilePlan,
    filters: FilterMap,
    createTemplate: TemplateFactory,
): boolean {
    const value = element.getAttribute(REPEAT_ATTR) ?? "";
    if (
        options.skipRepeat ||
        !element.hasAttribute(REPEAT_ATTR) ||
        pathOwnedBySubmitSource(value, options.submitBoundary)
    ) {
        return false;
    }
    const condition = element.getAttribute(CONDITION_ATTR);
    const conditionOwned = condition ? conditionOwnedBySubmitSource(condition, options.submitBoundary) : false;
    plan.repeats.push({
        path,
        spec: parseRepeat(value),
        template: compileElementTemplate(element, filters, createTemplate, {
            removeRepeat: true,
            removeCondition: !!options.submitBoundary && !!condition && !conditionOwned,
            submitBoundary: options.submitBoundary,
        }),
        rootCondition: conditionOwned || !condition ? null : compileCondition(condition, filters),
    });
    return true;
}

export function compileConditional(
    element: Element,
    path: NodePath,
    options: { skipCondition: boolean; submitBoundary: SubmitSourceBoundary | null },
    plan: CompilePlan,
    filters: FilterMap,
    createTemplate: TemplateFactory,
): boolean {
    const value = element.getAttribute(CONDITION_ATTR) ?? "";
    if (
        options.skipCondition ||
        !element.hasAttribute(CONDITION_ATTR) ||
        conditionOwnedBySubmitSource(value, options.submitBoundary)
    ) {
        return false;
    }
    plan.conditions.push({
        path,
        condition: compileCondition(value, filters),
        template: compileElementTemplate(element, filters, createTemplate, {
            removeCondition: !!options.submitBoundary,
            submitBoundary: options.submitBoundary,
        }),
    });
    return true;
}

function compileElementTemplate(
    element: Element,
    filters: FilterMap,
    createTemplate: TemplateFactory,
    options: { removeRepeat?: boolean; removeCondition?: boolean; submitBoundary?: SubmitSourceBoundary | null },
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
        submitBoundary: options.submitBoundary ?? null,
    });
}
