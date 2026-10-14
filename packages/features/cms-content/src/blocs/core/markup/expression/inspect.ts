import { parseBindingExpression } from "cms-content/blocs/core/markup/expression/parser";
import type { ExpressionNode, ExpressionValueType } from "cms-content/blocs/core/markup/expression/types";

const STABLE_VALUE_FILTERS = new Set(["dateLong", "minorCurrency", "string", "urlencode"]);

export function expressionValueType(node: ExpressionNode): ExpressionValueType {
    if (node.kind === "literal") {
        if (node.value === null) {
            return "null";
        }
        if (typeof node.value === "boolean") {
            return "boolean";
        }
        if (typeof node.value === "number") {
            return "number";
        }
        return "string";
    }
    if (node.kind === "not" || node.kind === "and" || node.kind === "or" || node.kind === "compare") {
        return "boolean";
    }
    if (node.kind === "filter" && STABLE_VALUE_FILTERS.has(node.name)) {
        return "string";
    }
    return "unknown";
}

export function isStableValueFilter(name: string): boolean {
    return STABLE_VALUE_FILTERS.has(name);
}

export function* expressionOperands(node: ExpressionNode): Generator<ExpressionNode> {
    if (node.kind === "not") {
        yield* expressionOperands(node.node);
    } else if (node.kind === "and" || node.kind === "or" || node.kind === "compare") {
        yield* expressionOperands(node.left);
        yield* expressionOperands(node.right);
    } else {
        yield node;
    }
}

export function collectExpressionReferences(expression: string): string[] {
    const references: string[] = [];
    try {
        for (const node of expressionOperands(parseBindingExpression(expression))) {
            if (node.kind === "path" || node.kind === "filter") {
                references.push(node.path);
            }
            if (node.kind === "filter" && node.argument) {
                references.push(node.argument);
            }
        }
    } catch {
        for (const match of expression.matchAll(/[A-Za-z_$][\w$]*(?:\.[\w$-]+)*/gu)) {
            references.push(match[0]);
        }
    }
    return references;
}
