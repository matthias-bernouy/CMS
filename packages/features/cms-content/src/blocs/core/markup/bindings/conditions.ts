import type {
    CmsCaseValue,
    CmsConditionExpression,
    CmsConditionFieldOperator,
    CmsConditionLiteral,
    CmsMatchExpression,
} from "cms-content/blocs/core/markup/bindings/types";
import { parseBindingExpression } from "cms-content/blocs/core/markup/expression/parser";

export function asCondition(expression: CmsConditionExpression): string {
    return expression.trim();
}

export function parseCondition(value: string): CmsConditionExpression | null {
    const expression = value.trim();
    if (!expression) {
        return null;
    }
    try {
        parseBindingExpression(expression);
        return expression;
    } catch {
        return null;
    }
}

export function parseMatch(value: string): CmsMatchExpression | null {
    return parseCondition(value);
}

export function parseCase(value: string): CmsCaseValue | null | undefined {
    const expression = value.trim();
    if (!expression) {
        return undefined;
    }
    try {
        const node = parseBindingExpression(expression);
        return node.kind === "literal" ? node.value : undefined;
    } catch {
        return undefined;
    }
}

export function asFieldCondition(
    path: string,
    operator: CmsConditionFieldOperator = "truthy",
    value: CmsConditionLiteral = true,
): CmsConditionExpression {
    const normalizedPath = normalizeConditionPath(path);
    if (operator === "truthy") {
        return normalizedPath;
    }
    if (operator === "falsy") {
        return `!${normalizedPath}`;
    }
    if (operator === "empty") {
        return `${normalizedPath}.length === 0`;
    }
    if (operator === "notEmpty") {
        return `${normalizedPath}.length > 0`;
    }
    return `${normalizedPath} ${comparisonOperator(operator)} ${asConditionLiteral(value)}`;
}

export function asConditionLiteral(value: CmsConditionLiteral): string {
    if (typeof value === "string") {
        return JSON.stringify(value);
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error(`Invalid condition number: ${value}`);
        }
        return String(value);
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    return "null";
}

function normalizeConditionPath(path: string): string {
    const normalized = path.trim();
    if (!normalized) {
        throw new Error("Condition path is required");
    }
    if (normalized === ".") {
        return normalized;
    }
    if (!/^[A-Za-z_$][\w$-]*(?:\.[\w$-]+)*$/.test(normalized)) {
        throw new Error(`Invalid condition path: "${path}"`);
    }
    return normalized;
}

function comparisonOperator(operator: CmsConditionFieldOperator): "===" | "!==" | ">" | ">=" | "<" | "<=" {
    const operators: Partial<Record<CmsConditionFieldOperator, "===" | "!==" | ">" | ">=" | "<" | "<=">> = {
        equals: "===",
        notEquals: "!==",
        greaterThan: ">",
        greaterThanOrEqual: ">=",
        lessThan: "<",
        lessThanOrEqual: "<=",
    };
    const comparison = operators[operator];
    if (!comparison) {
        throw new Error(`Unsupported comparison operator: ${operator}`);
    }
    return comparison;
}
