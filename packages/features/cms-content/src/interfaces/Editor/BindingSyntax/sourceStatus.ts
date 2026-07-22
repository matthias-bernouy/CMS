import {
    CMS_BINDING_ATTRIBUTES,
    CMS_SOURCES_STATUS_SCOPE,
    CMS_SOURCE_METHODS,
    CMS_SOURCE_STATES,
    CMS_SOURCE_STATUS_SCOPE,
    CMS_SOURCE_TRIGGERS,
    type CmsConditionExpression,
    type CmsSourceMethod,
    type CmsSourceState,
    type CmsSourceStatusCondition,
    type CmsSourceTrigger,
} from "./types";

const SOURCE_STATUS_ID_PATTERN = /^[A-Za-z_$][\w$-]*$/;

export function asSourceStatusCondition(state: CmsSourceState, sourceId?: string): CmsConditionExpression {
    const id = sourceId?.trim();
    if (id && !SOURCE_STATUS_ID_PATTERN.test(id)) {
        throw new Error(`Invalid source status id: "${sourceId}"`);
    }
    return id ? `${CMS_SOURCES_STATUS_SCOPE}.${id}.${state}` : `${CMS_SOURCE_STATUS_SCOPE}.${state}`;
}

export function asSourceStatusConditions(conditions: CmsSourceStatusCondition[]): CmsConditionExpression {
    return conditions.map((condition) => asSourceStatusCondition(condition.state, condition.sourceId)).join(" || ");
}

export function parseSourceStatusCondition(value: string | null): CmsSourceState | null {
    return parseSourceStatusConditionDetails(value)?.state ?? null;
}

export function parseSourceStatusConditionDetails(value: string | null): CmsSourceStatusCondition | null {
    const conditions = parseSourceStatusConditions(value);
    return conditions.length === 1 ? conditions[0]! : null;
}

export function parseSourceStatusConditions(value: string | null): CmsSourceStatusCondition[] {
    const expression = value?.trim() ?? "";
    if (!expression) {
        return [];
    }
    const conditions: CmsSourceStatusCondition[] = [];
    for (const part of expression.split(/\s*\|\|\s*/)) {
        const condition = parseSingleSourceStatusCondition(part);
        if (!condition) {
            return [];
        }
        conditions.push(condition);
    }
    return conditions;
}

export function sourceStatusConditionFromElement(element: Element): CmsSourceState | null {
    return parseSourceStatusCondition(element.getAttribute(CMS_BINDING_ATTRIBUTES.condition));
}

export function sourceStatusConditionDetailsFromElement(element: Element): CmsSourceStatusCondition | null {
    return parseSourceStatusConditionDetails(element.getAttribute(CMS_BINDING_ATTRIBUTES.condition));
}

export function sourceStatusConditionsFromElement(element: Element): CmsSourceStatusCondition[] {
    return parseSourceStatusConditions(element.getAttribute(CMS_BINDING_ATTRIBUTES.condition));
}

export function applySourceStatusCondition(element: Element, state: CmsSourceState, sourceId?: string): void {
    element.setAttribute(CMS_BINDING_ATTRIBUTES.condition, asSourceStatusCondition(state, sourceId));
}

export function applySourceStatusConditions(element: Element, conditions: CmsSourceStatusCondition[]): void {
    if (conditions.length === 0) {
        element.removeAttribute(CMS_BINDING_ATTRIBUTES.condition);
        return;
    }
    element.setAttribute(CMS_BINDING_ATTRIBUTES.condition, asSourceStatusConditions(conditions));
}

export function clearSourceStatusCondition(element: Element): void {
    if (sourceStatusConditionsFromElement(element).length > 0) {
        element.removeAttribute(CMS_BINDING_ATTRIBUTES.condition);
    }
}

export function isCmsSourceState(value: string | null): value is CmsSourceState {
    return (CMS_SOURCE_STATES as readonly string[]).includes(value ?? "");
}

export function isCmsSourceTrigger(value: string | null): value is CmsSourceTrigger {
    return (CMS_SOURCE_TRIGGERS as readonly string[]).includes(value ?? "");
}

export function isCmsSourceMethod(value: string | null): value is CmsSourceMethod {
    return (CMS_SOURCE_METHODS as readonly string[]).includes((value ?? "").toUpperCase());
}

function parseSingleSourceStatusCondition(value: string): CmsSourceStatusCondition | null {
    const expression = value.trim();
    for (const state of CMS_SOURCE_STATES) {
        if (expression === asSourceStatusCondition(state)) {
            return { state };
        }
    }
    const match = /^\$sources\.([A-Za-z_$][\w$-]*)\.(loaded|loading|empty|error)$/.exec(expression);
    return match ? { sourceId: match[1]!, state: match[2] as CmsSourceState } : null;
}
