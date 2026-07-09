import type {
    DashboardBinding,
    DashboardOption,
    DashboardVisibilityRule,
} from "../../interfaces/Dashboard";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
const PARAM_EXPR = /^\$(row|resource|field|filter|param|selection|search|value|input|user|media)(\.[A-Za-z_$][\w$]*)*$/;
export const ACTION_AFTER_EXPR = /^\$(result|selection)(\.[A-Za-z_$][\w$]*)*$/;

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
    if (!SAFE_PATH.test(value)) errors.push(`${path}.${name} must be a dotted data path`);
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

function validateExpression(path: string, value: string, errors: string[]): void {
    if (!value.startsWith("$")) return;
    if (!PARAM_EXPR.test(value)) errors.push(`${path} has an invalid binding expression`);
}

export function validateBinding(binding: DashboardBinding | undefined, path: string, errors: string[]): void {
    if (!binding) return;
    validatePath("path", binding.path, path, errors);
}

export function validateVisibility(rule: DashboardVisibilityRule | undefined, path: string, errors: string[]): void {
    if (!rule) return;
    validatePath("field", rule.field, path, errors);
    if (rule.equals === undefined && rule.notEquals === undefined) {
        errors.push(`${path} must declare equals or notEquals`);
    }
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
