import type {
    DashboardBinding,
    DashboardOption,
    DashboardVisibilityRule,
} from "../../interfaces/Dashboard";
import {
    isSafeDashboardExpression,
    isSafeDashboardPath,
} from "../dashboardPaths";
import {
    DASHBOARD_VISIBILITY_MAX_DEPTH,
    DASHBOARD_VISIBILITY_MAX_NODES,
    isDashboardVisibilityExpression,
} from "../dashboardVisibility";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const PARAM_EXPRESSION_ROOTS = [
    "row", "resource", "field", "filter", "param", "selection",
    "search", "value", "input", "user", "media",
];

export function validateRequiredId(path: string, value: string | undefined, errors: string[]): void {
    if (value === undefined || value === "") {
        errors.push(`${path} is required`);
        return;
    }
    validateId(path, value, errors);
}

export function validateId(path: string, value: string | undefined, errors: string[]): void {
    if (value === undefined) return;
    if (!SIMPLE_ID.test(value)) errors.push(`${path} must be a simple id`);
}

export function validateRequiredPath(name: string, value: string | undefined, path: string, errors: string[]): void {
    if (value === undefined || value === "") {
        errors.push(`${path}.${name} is required`);
        return;
    }
    validatePath(name, value, path, errors);
}

export function validatePath(name: string, value: string | undefined, path: string, errors: string[]): void {
    if (value === undefined) return;
    if (!isSafeDashboardPath(value)) errors.push(`${path}.${name} must be a safe dotted data path`);
}

export function validateExpressionMap(map: Record<string, string> | undefined, path: string, errors: string[]): void {
    if (!map) return;
    for (const [key, value] of Object.entries(map)) {
        if (!key) errors.push(`${path} contains an empty key`);
        if (typeof value !== "string") {
            errors.push(`${path}.${key} must be a string expression`);
        } else {
            validateExpression(`${path}.${key}`, value, errors);
        }
    }
}

export function validateResourceExpression(value: unknown, path: string, errors: string[]): void {
    if (typeof value !== "string" || !isSafeDashboardExpression(value, ["resource"], true)) {
        errors.push(`${path} must be a $resource expression with a safe dotted data path`);
    }
}

function validateExpression(path: string, value: string, errors: string[]): void {
    if (!value.startsWith("$")) return;
    if (!isSafeDashboardExpression(value, PARAM_EXPRESSION_ROOTS)) {
        errors.push(`${path} has an invalid binding expression`);
    }
}

export function isSafeActionAfterExpression(value: string): boolean {
    return isSafeDashboardExpression(value, ["result", "selection"]);
}

export function validateBinding(binding: DashboardBinding | undefined, path: string, errors: string[]): void {
    if (!binding) return;
    validatePath("path", binding.path, path, errors);
}

export function validateVisibility(
    rule: DashboardVisibilityRule | undefined,
    path: string,
    errors: string[],
    availableFieldIds?: ReadonlySet<string>,
): void {
    if (rule === undefined) return;
    validateVisibilityRule(rule, path, errors, availableFieldIds, 0, { nodes: 0, exhausted: false });
}

function validateVisibilityRule(
    value: unknown,
    path: string,
    errors: string[],
    availableFieldIds: ReadonlySet<string> | undefined,
    depth: number,
    budget: { nodes: number; exhausted: boolean },
): void {
    if (budget.exhausted) return;
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
    const hasCondition = Object.hasOwn(value, "value") || Object.hasOwn(value, "equals") || Object.hasOwn(value, "notEquals");
    if (hasAll || hasAny) {
        if (hasAll && hasAny) errors.push(`${path} cannot declare both all and any`);
        if (hasCondition) errors.push(`${path} cannot combine a group with a value condition`);
        if (Object.keys(value).some(key => key !== "all" && key !== "any")) errors.push(`${path} contains unsupported visibility properties`);
        if (hasAll === hasAny || hasCondition || Object.keys(value).length !== 1) return;
        const kind = hasAll ? "all" : "any";
        const rules = value[kind];
        if (!Array.isArray(rules) || rules.length === 0) {
            errors.push(`${path}.${kind} must contain at least one rule`);
            return;
        }
        for (const [index, entry] of rules.entries()) {
            validateVisibilityRule(entry, `${path}.${kind}.${index}`, errors, availableFieldIds, depth + 1, budget);
            if (budget.exhausted) break;
        }
        return;
    }

    if (!isDashboardVisibilityExpression(value.value)) {
        errors.push(`${path}.value must be a $field or $resource expression`);
    } else if (value.value.startsWith("$field.") && availableFieldIds) {
        const fieldId = value.value.slice("$field.".length).split(".")[0]!;
        if (!availableFieldIds.has(fieldId)) errors.push(`${path}.value references unknown field "${fieldId}"`);
    }
    const hasEquals = Object.hasOwn(value, "equals");
    const hasNotEquals = Object.hasOwn(value, "notEquals");
    if (hasEquals === hasNotEquals) errors.push(`${path} must declare exactly one of equals or notEquals`);
    if (Object.keys(value).some(key => key !== "value" && key !== "equals" && key !== "notEquals")) {
        errors.push(`${path} contains unsupported visibility properties`);
    }
    if (hasEquals && !isVisibilityValue(value.equals)) errors.push(`${path}.equals must be a finite primitive value`);
    if (hasNotEquals && !isVisibilityValue(value.notEquals)) errors.push(`${path}.notEquals must be a finite primitive value`);
}

function isVisibilityValue(value: unknown): value is string | number | boolean | null {
    return value === null
        || typeof value === "string"
        || typeof value === "boolean"
        || (typeof value === "number" && Number.isFinite(value));
}

export function validateOptions(options: DashboardOption[] | undefined, path: string, errors: string[]): void {
    if (!Array.isArray(options) || options.length === 0) {
        errors.push(`${path} must contain at least one option`);
        return;
    }
    options.forEach((option, index) => {
        if (!option.value) errors.push(`${path}.${index}.value is required`);
        if (!option.label) errors.push(`${path}.${index}.label is required`);
    });
}

export function isSafeDownloadFilename(value: string): boolean {
    return Boolean(value.trim()) && !value.includes("/") && !value.includes("\\") && !value.includes("\0");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
