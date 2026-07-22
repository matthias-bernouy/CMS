import type { DashboardVisibilityRule } from "cms-dashboards/interfaces/Dashboard";
import {
    DASHBOARD_VISIBILITY_MAX_DEPTH,
    DASHBOARD_VISIBILITY_MAX_NODES,
    isDashboardVisibilityExpression,
} from "cms-dashboards/core/dashboardVisibility";
import { isRecord } from "./basic";

type VisibilityBudget = { nodes: number; exhausted: boolean };

export function validateVisibility(
    rule: DashboardVisibilityRule | undefined,
    path: string,
    errors: string[],
    availableFieldIds?: ReadonlySet<string>,
): void {
    if (rule !== undefined) {
        validateVisibilityRule(rule, path, errors, availableFieldIds, 0, { nodes: 0, exhausted: false });
    }
}

function validateVisibilityRule(
    value: unknown,
    path: string,
    errors: string[],
    availableFieldIds: ReadonlySet<string> | undefined,
    depth: number,
    budget: VisibilityBudget,
): void {
    if (budget.exhausted) {
        return;
    }
    if (depth >= DASHBOARD_VISIBILITY_MAX_DEPTH) {
        errors.push(`${path} exceeds the maximum visibility depth`);
        return;
    }
    if (++budget.nodes > DASHBOARD_VISIBILITY_MAX_NODES) {
        errors.push(`${path} exceeds the maximum visibility rule count`);
        budget.exhausted = true;
        return;
    }
    if (!isRecord(value)) {
        errors.push(`${path} must be a visibility rule object`);
        return;
    }

    const hasAll = Object.hasOwn(value, "all");
    const hasAny = Object.hasOwn(value, "any");
    const hasCondition =
        Object.hasOwn(value, "value") || Object.hasOwn(value, "equals") || Object.hasOwn(value, "notEquals");
    if (hasAll || hasAny) {
        validateVisibilityGroup(value, path, errors, availableFieldIds, depth, budget, hasAll, hasAny, hasCondition);
        return;
    }
    validateVisibilityCondition(value, path, errors, availableFieldIds);
}

function validateVisibilityGroup(
    value: Record<string, unknown>,
    path: string,
    errors: string[],
    availableFieldIds: ReadonlySet<string> | undefined,
    depth: number,
    budget: VisibilityBudget,
    hasAll: boolean,
    hasAny: boolean,
    hasCondition: boolean,
): void {
    if (hasAll && hasAny) {
        errors.push(`${path} cannot declare both all and any`);
    }
    if (hasCondition) {
        errors.push(`${path} cannot combine a group with a value condition`);
    }
    if (Object.keys(value).some((key) => key !== "all" && key !== "any")) {
        errors.push(`${path} contains unsupported visibility properties`);
    }
    if (hasAll === hasAny || hasCondition || Object.keys(value).length !== 1) {
        return;
    }
    const kind = hasAll ? "all" : "any";
    const rules = value[kind];
    if (!Array.isArray(rules) || rules.length === 0) {
        errors.push(`${path}.${kind} must contain at least one rule`);
        return;
    }
    for (const [index, entry] of rules.entries()) {
        validateVisibilityRule(entry, `${path}.${kind}.${index}`, errors, availableFieldIds, depth + 1, budget);
        if (budget.exhausted) {
            break;
        }
    }
}

function validateVisibilityCondition(
    value: Record<string, unknown>,
    path: string,
    errors: string[],
    availableFieldIds?: ReadonlySet<string>,
): void {
    if (!isDashboardVisibilityExpression(value.value)) {
        errors.push(`${path}.value must be a $field or $resource expression`);
    } else if (value.value.startsWith("$field.") && availableFieldIds) {
        const fieldId = value.value.slice("$field.".length).split(".")[0]!;
        if (!availableFieldIds.has(fieldId)) {
            errors.push(`${path}.value references unknown field "${fieldId}"`);
        }
    }
    const hasEquals = Object.hasOwn(value, "equals");
    const hasNotEquals = Object.hasOwn(value, "notEquals");
    if (hasEquals === hasNotEquals) {
        errors.push(`${path} must declare exactly one of equals or notEquals`);
    }
    if (Object.keys(value).some((key) => key !== "value" && key !== "equals" && key !== "notEquals")) {
        errors.push(`${path} contains unsupported visibility properties`);
    }
    if (hasEquals && !isVisibilityValue(value.equals)) {
        errors.push(`${path}.equals must be a finite primitive value`);
    }
    if (hasNotEquals && !isVisibilityValue(value.notEquals)) {
        errors.push(`${path}.notEquals must be a finite primitive value`);
    }
}

function isVisibilityValue(value: unknown): value is string | number | boolean | null {
    return (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    );
}
