import type { LogAttributes, LogError } from "logging/interfaces/Logger";
import { redactDiagnosticString } from "logging/core/redaction";

const REDACTED = "[REDACTED]";
const TRUNCATED = "[TRUNCATED]";
const CIRCULAR = "[CIRCULAR]";
const UNAVAILABLE = "[UNAVAILABLE]";
const MAX_DEPTH = 4;
const MAX_ENTRIES = 32;
const MAX_NODES = 256;
const MAX_STRING_LENGTH = 2_048;
const MAX_KEY_LENGTH = 128;
const MAX_TOTAL_STRING_UNITS = 16_384;
const SECRET_KEY = /(authorization|cookie|credential|password|secret|session|token|api[-_]?key|private[-_]?key)/iu;

type SanitizationBudget = {
    nodes: number;
    stringUnits: number;
    readonly ancestors: WeakSet<object>;
};

export function sanitizeAttributes(attributes: LogAttributes): Readonly<Record<string, unknown>> {
    return sanitizeObject(attributes, 0, createBudget());
}

export function sanitizeError(error: unknown, includeStack: boolean): LogError | undefined {
    if (error === undefined || error === null) {
        return undefined;
    }
    const budget = createBudget();
    if (error instanceof Error) {
        return Object.freeze({
            name: sanitizeString(error.name || "Error", budget),
            message: sanitizeString(error.message, budget),
            ...(includeStack && error.stack ? { stack: sanitizeString(error.stack, budget) } : {}),
        });
    }
    return Object.freeze({ name: "UnknownError", message: sanitizeString(String(error), budget) });
}

function createBudget(): SanitizationBudget {
    return { nodes: MAX_NODES, stringUnits: MAX_TOTAL_STRING_UNITS, ancestors: new WeakSet() };
}

function sanitizeObject(
    value: Readonly<Record<string, unknown>>,
    depth: number,
    budget: SanitizationBudget,
): Readonly<Record<string, unknown>> {
    if (!takeNode(budget) || depth >= MAX_DEPTH) {
        return Object.freeze({ truncated: TRUNCATED });
    }
    if (budget.ancestors.has(value)) {
        return Object.freeze({ circular: CIRCULAR });
    }
    budget.ancestors.add(value);
    const output: Record<string, unknown> = {};
    let count = 0;
    try {
        for (const key in value) {
            if (!Object.prototype.hasOwnProperty.call(value, key)) {
                continue;
            }
            if (count >= MAX_ENTRIES || budget.nodes <= 0 || budget.stringUnits <= 0) {
                break;
            }
            count += 1;
            const sanitizedKey = takeText(key, budget, MAX_KEY_LENGTH);
            if (!sanitizedKey || Object.prototype.hasOwnProperty.call(output, sanitizedKey)) {
                continue;
            }
            if (SECRET_KEY.test(key)) {
                output[sanitizedKey] = REDACTED;
                continue;
            }
            let entry: unknown;
            try {
                entry = value[key];
            } catch {
                entry = UNAVAILABLE;
            }
            output[sanitizedKey] = sanitizeValue(entry, depth + 1, budget);
        }
    } finally {
        budget.ancestors.delete(value);
    }
    return Object.freeze(output);
}

function sanitizeValue(value: unknown, depth: number, budget: SanitizationBudget): unknown {
    if (!takeNode(budget)) {
        return TRUNCATED;
    }
    if (value === null || typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        return sanitizeString(value, budget);
    }
    if (typeof value === "bigint") {
        return takeText(value.toString(), budget, MAX_STRING_LENGTH);
    }
    if (value instanceof Date) {
        return takeText(value.toISOString(), budget, MAX_STRING_LENGTH);
    }
    if (value instanceof Error) {
        return sanitizeNestedError(value, budget);
    }
    if (depth >= MAX_DEPTH) {
        return TRUNCATED;
    }
    if (Array.isArray(value)) {
        if (budget.ancestors.has(value)) {
            return CIRCULAR;
        }
        budget.ancestors.add(value);
        try {
            const output: unknown[] = [];
            for (const entry of value) {
                if (output.length >= MAX_ENTRIES || budget.nodes <= 0 || budget.stringUnits <= 0) {
                    break;
                }
                output.push(sanitizeValue(entry, depth + 1, budget));
            }
            return Object.freeze(output);
        } finally {
            budget.ancestors.delete(value);
        }
    }
    if (typeof value === "object") {
        return sanitizeObject(value as Readonly<Record<string, unknown>>, depth, budget);
    }
    return takeText(String(value), budget, MAX_STRING_LENGTH);
}

function sanitizeNestedError(error: Error, budget: SanitizationBudget): LogError {
    return Object.freeze({
        name: sanitizeString(error.name || "Error", budget),
        message: sanitizeString(error.message, budget),
    });
}

function sanitizeString(value: string, budget: SanitizationBudget): string {
    const redacted = redactDiagnosticString(value, MAX_STRING_LENGTH);
    return takeText(redacted, budget, MAX_STRING_LENGTH);
}

function takeNode(budget: SanitizationBudget): boolean {
    if (budget.nodes <= 0) {
        return false;
    }
    budget.nodes -= 1;
    return true;
}

function takeText(value: string, budget: SanitizationBudget, maximum: number): string {
    const available = Math.min(maximum, budget.stringUnits);
    if (available <= 0) {
        return "";
    }
    const truncated = value.length <= available ? value : `${value.slice(0, Math.max(0, available - 1))}…`;
    budget.stringUnits -= truncated.length;
    return truncated;
}
