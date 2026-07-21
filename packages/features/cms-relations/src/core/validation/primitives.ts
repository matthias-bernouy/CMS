import type { RelationEndpointRef } from "../../interfaces/Relation";

export const RELATION_EXPR = /^\$(from|page)(\.[A-Za-z_$][\w$]*)*$/;
export const RELATION_ACTION_EXPR = /^\$(from|row|field|page)(\.[A-Za-z_$][\w$]*)*$/;
export const MAX_RELATION_LIMIT = 100;

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

export function validateExpressionMap(
    map: Record<string, string>,
    path: string,
    errors: string[],
    expressionPattern = RELATION_EXPR,
): void {
    for (const [key, value] of Object.entries(map)) {
        validateRequiredId(`${path}.${key}`, key, errors);
        if (typeof value !== "string") {
            errors.push(`${path}.${key} must be a string expression`);
        } else if (value.startsWith("$") && !expressionPattern.test(value)) {
            errors.push(`${path}.${key} has an invalid binding expression`);
        }
    }
}

export function validateRequiredPath(path: string, value: string | undefined, errors: string[]): void {
    if (!value) {
        errors.push(`${path} is required`);
        return;
    }
    validatePath(path, value, errors);
}

export function validatePath(path: string, value: string | undefined, errors: string[]): void {
    if (value !== undefined && value !== "" && !SAFE_PATH.test(value)) {
        errors.push(`${path} must be a safe dotted path`);
    }
}

export function validateId(path: string, value: string | undefined, errors: string[]): void {
    if (value !== undefined && value !== "" && !SIMPLE_ID.test(value)) {
        errors.push(`${path} must be a simple id`);
    }
}

export function validateRequiredId(path: string, value: string | undefined, errors: string[]): void {
    if (!value) {
        errors.push(`${path} is required`);
        return;
    }
    validateId(path, value, errors);
}

export function validateEnum(path: string, value: unknown, values: readonly string[], errors: string[]): void {
    if (!values.includes(String(value))) {
        errors.push(`${path} must be ${values.join("|")}`);
    }
}

export function validateEndpointRefShape(ref: RelationEndpointRef | undefined, path: string, errors: string[]): void {
    if (!isRecord(ref)) {
        errors.push(`${path} must be an object`);
        return;
    }
    validateRequiredId(`${path}.sourceId`, ref.sourceId, errors);
    validateRequiredId(`${path}.endpointId`, ref.endpointId, errors);
}

export function isString(value: string | undefined): value is string {
    return typeof value === "string" && value.length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
