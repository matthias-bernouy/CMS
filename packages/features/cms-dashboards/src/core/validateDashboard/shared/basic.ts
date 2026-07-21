import type { DashboardBinding, DashboardOption } from "cms-dashboards/interfaces/Dashboard";
import { DASHBOARD_MAX_OPTIONS } from "cms-dashboards/interfaces/Dashboard";
import { isSafeDashboardExpression, isSafeDashboardPath } from "cms-dashboards/core/dashboardPaths";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const PARAM_EXPRESSION_ROOTS = [
    "row",
    "resource",
    "field",
    "filter",
    "param",
    "selection",
    "search",
    "value",
    "input",
    "user",
    "media",
];

export function validateRequiredId(path: string, value: string | undefined, errors: string[]): void {
    if (value === undefined || value === "") {
        errors.push(`${path} is required`);
        return;
    }
    validateId(path, value, errors);
}

export function validateId(path: string, value: string | undefined, errors: string[]): void {
    if (value !== undefined && !SIMPLE_ID.test(value)) {
        errors.push(`${path} must be a simple id`);
    }
}

export function validateRequiredPath(name: string, value: string | undefined, path: string, errors: string[]): void {
    if (value === undefined || value === "") {
        errors.push(`${path}.${name} is required`);
        return;
    }
    validatePath(name, value, path, errors);
}

export function validatePath(name: string, value: string | undefined, path: string, errors: string[]): void {
    if (value !== undefined && !isSafeDashboardPath(value)) {
        errors.push(`${path}.${name} must be a safe dotted data path`);
    }
}

export function validateExpressionMap(map: Record<string, string> | undefined, path: string, errors: string[]): void {
    if (!map) {
        return;
    }
    for (const [key, value] of Object.entries(map)) {
        if (!key) {
            errors.push(`${path} contains an empty key`);
        }
        if (typeof value !== "string") {
            errors.push(`${path}.${key} must be a string expression`);
        } else if (value.startsWith("$") && !isSafeDashboardExpression(value, PARAM_EXPRESSION_ROOTS)) {
            errors.push(`${path}.${key} has an invalid binding expression`);
        }
    }
}

export function validateResourceExpression(value: unknown, path: string, errors: string[]): void {
    if (typeof value !== "string" || !isSafeDashboardExpression(value, ["resource"], true)) {
        errors.push(`${path} must be a $resource expression with a safe dotted data path`);
    }
}

export function isSafeActionAfterExpression(value: string): boolean {
    return isSafeDashboardExpression(value, ["result", "selection"]);
}

export function validateBinding(binding: DashboardBinding | undefined, path: string, errors: string[]): void {
    if (binding) {
        validatePath("path", binding.path, path, errors);
    }
}

export function validateOptions(options: DashboardOption[] | undefined, path: string, errors: string[]): void {
    if (!Array.isArray(options) || options.length === 0) {
        errors.push(`${path} must contain at least one option`);
        return;
    }
    if (options.length > DASHBOARD_MAX_OPTIONS) {
        errors.push(`${path} must contain at most ${DASHBOARD_MAX_OPTIONS} options`);
    }
    const values = new Set<string>();
    options.slice(0, DASHBOARD_MAX_OPTIONS).forEach((option, index) => {
        if (!option.value) {
            errors.push(`${path}.${index}.value is required`);
        }
        if (!option.label) {
            errors.push(`${path}.${index}.label is required`);
        }
        if (option.value) {
            if (values.has(option.value)) {
                errors.push(`${path}.${index}.value is duplicated`);
            }
            values.add(option.value);
        }
    });
}

export function isSafeDownloadFilename(value: string): boolean {
    return Boolean(value.trim()) && !value.includes("/") && !value.includes("\\") && !value.includes("\0");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
