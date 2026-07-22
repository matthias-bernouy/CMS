import {
    DASHBOARD_VISIBILITY_MAX_DEPTH,
    DASHBOARD_VISIBILITY_MAX_NODES,
    isDashboardVisibilityExpression,
    type DashboardVisibilityRule,
} from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../errors";
import { isRecord } from "../../definition/values";

export function parseVisibilityRule(value: unknown, name: string): DashboardVisibilityRule {
    return parseRule(value, name, 0, { nodes: 0 });
}

function parseRule(value: unknown, name: string, depth: number, budget: { nodes: number }): DashboardVisibilityRule {
    if (depth >= DASHBOARD_VISIBILITY_MAX_DEPTH) {
        throw new IntegrationInputError(name, "exceeds the maximum visibility depth");
    }
    if (++budget.nodes > DASHBOARD_VISIBILITY_MAX_NODES) {
        throw new IntegrationInputError(name, "exceeds the maximum visibility rule count");
    }
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }

    const hasAll = Object.hasOwn(value, "all");
    const hasAny = Object.hasOwn(value, "any");
    const hasCondition =
        Object.hasOwn(value, "value") || Object.hasOwn(value, "equals") || Object.hasOwn(value, "notEquals");
    if (hasAll || hasAny) {
        if (hasAll && hasAny) {
            throw new IntegrationInputError(name, "cannot declare both all and any");
        }
        if (hasCondition) {
            throw new IntegrationInputError(name, "cannot combine a group with a value condition");
        }
        if (Object.keys(value).length !== 1) {
            throw new IntegrationInputError(name, "contains unsupported visibility properties");
        }
        const kind = hasAll ? "all" : "any";
        const rules = value[kind];
        if (!Array.isArray(rules) || rules.length === 0) {
            throw new IntegrationInputError(`${name}.${kind}`, "must contain at least one rule");
        }
        const parsed = rules.map((rule, index) => parseRule(rule, `${name}.${kind}.${index}`, depth + 1, budget));
        return kind === "all" ? { all: parsed } : { any: parsed };
    }

    if (!isDashboardVisibilityExpression(value.value)) {
        throw new IntegrationInputError(`${name}.value`, "must be a $field or $resource expression");
    }
    const hasEquals = Object.hasOwn(value, "equals");
    const hasNotEquals = Object.hasOwn(value, "notEquals");
    if (hasEquals === hasNotEquals) {
        throw new IntegrationInputError(name, "must declare exactly one of equals or notEquals");
    }
    if (Object.keys(value).length !== 2) {
        throw new IntegrationInputError(name, "contains unsupported visibility properties");
    }
    return hasEquals
        ? { value: value.value, equals: parseVisibilityValue(value.equals, `${name}.equals`) }
        : { value: value.value, notEquals: parseVisibilityValue(value.notEquals, `${name}.notEquals`) };
}

function parseVisibilityValue(value: unknown, name: string): string | number | boolean | null {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    throw new IntegrationInputError(name, "must be a finite string, number, boolean, or null");
}
