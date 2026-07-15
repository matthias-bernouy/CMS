import type { DashboardVisibilityRule } from "../interfaces/Dashboard";

export const DASHBOARD_VISIBILITY_MAX_DEPTH = 10;
export const DASHBOARD_VISIBILITY_MAX_NODES = 500;

const VISIBILITY_EXPRESSION = /^\$(field|resource)\.[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

export function isDashboardVisibilityExpression(value: unknown): value is string {
    return typeof value === "string" && VISIBILITY_EXPRESSION.test(value);
}

export function evaluateDashboardVisibility(
    rule: DashboardVisibilityRule | undefined,
    resolve: (expression: string) => unknown,
): boolean {
    if (rule === undefined) return true;
    const result = evaluateRule(rule, resolve, 0, { nodes: 0 });
    return result.valid && result.matches;
}

type VisibilityEvaluation = { valid: true; matches: boolean } | { valid: false; matches: false };

function evaluateRule(
    value: unknown,
    resolve: (expression: string) => unknown,
    depth: number,
    budget: { nodes: number },
): VisibilityEvaluation {
    if (depth >= DASHBOARD_VISIBILITY_MAX_DEPTH || ++budget.nodes > DASHBOARD_VISIBILITY_MAX_NODES) return invalid();
    if (!isRecord(value)) return invalid();

    const hasAll = Object.hasOwn(value, "all");
    const hasAny = Object.hasOwn(value, "any");
    const hasCondition = Object.hasOwn(value, "value") || Object.hasOwn(value, "equals") || Object.hasOwn(value, "notEquals");
    if (hasAll || hasAny) {
        if (hasAll === hasAny || hasCondition || Object.keys(value).length !== 1) return invalid();
        const rules = hasAll ? value.all : value.any;
        if (!Array.isArray(rules) || rules.length === 0) return invalid();
        let matches = hasAll;
        for (const entry of rules) {
            const result = evaluateRule(entry, resolve, depth + 1, budget);
            if (!result.valid) return invalid();
            matches = hasAll ? matches && result.matches : matches || result.matches;
        }
        return { valid: true, matches };
    }

    const hasEquals = Object.hasOwn(value, "equals");
    const hasNotEquals = Object.hasOwn(value, "notEquals");
    if (!isDashboardVisibilityExpression(value.value) || hasEquals === hasNotEquals || Object.keys(value).length !== 2) return invalid();
    const expected = hasEquals ? value.equals : value.notEquals;
    if (!isVisibilityValue(expected)) return invalid();
    const actual = resolve(value.value);
    if (actual === undefined) return { valid: true, matches: false };
    return { valid: true, matches: hasEquals ? actual === expected : actual !== expected };
}

function invalid(): VisibilityEvaluation {
    return { valid: false, matches: false };
}

function isVisibilityValue(value: unknown): value is string | number | boolean | null {
    return value === null
        || typeof value === "string"
        || typeof value === "boolean"
        || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
