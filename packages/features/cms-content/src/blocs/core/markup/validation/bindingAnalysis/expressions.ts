import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { parseBindingExpression } from "cms-content/blocs/core/markup/expression/parser";
import type { ExpressionCompareOperator, ExpressionNode } from "cms-content/blocs/core/markup/expression/types";
import type { BindingFacts, BindingScope, BindingVariable } from "./model";
import { withFact, withMaximumLength, withMinimumLength } from "./model";
import { resolveBindingPath } from "./paths";

export type ExpressionAnalysis = { readonly value: BindingVariable; readonly whenTrue: BindingFacts };

export function analyzeBindingExpression(
    expression: string,
    scope: BindingScope,
    facts: BindingFacts,
): ExpressionAnalysis {
    let node: ExpressionNode;
    try {
        node = parseBindingExpression(expression);
    } catch (error) {
        throw new ContentValidationError(
            "content",
            `invalid binding expression: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    return analyzeNode(node, scope, facts);
}

export function factsForMatchCase(
    expression: string,
    value: string | number | boolean | null,
    scope: BindingScope,
    facts: BindingFacts,
): BindingFacts {
    const node = parseBindingExpression(expression);
    analyzeNode(node, scope, facts);
    return node.kind === "path" ? withFact(facts, node.path, value) : facts;
}

function analyzeNode(node: ExpressionNode, scope: BindingScope, facts: BindingFacts): ExpressionAnalysis {
    if (node.kind === "literal") {
        return { value: literalVariable(node.value), whenTrue: facts };
    }
    if (node.kind === "path") {
        return {
            value: resolveBindingPath(node.path, scope, facts),
            whenTrue: node.path.endsWith(".hasData") ? withFact(facts, node.path, true) : facts,
        };
    }
    if (node.kind === "filter") {
        resolveBindingPath(node.path, scope, facts);
        if (node.argument) {
            resolveBindingPath(node.argument, scope, facts);
        }
        return { value: { kind: "schema", schema: { type: "string" } }, whenTrue: facts };
    }
    if (node.kind === "not") {
        analyzeNode(node.node, scope, facts);
        return boolean(facts);
    }
    if (node.kind === "or") {
        analyzeNode(node.left, scope, facts);
        analyzeNode(node.right, scope, facts);
        return boolean(facts);
    }
    if (node.kind === "and") {
        const left = analyzeNode(node.left, scope, facts);
        const right = analyzeNode(node.right, scope, left.whenTrue);
        return boolean(right.whenTrue);
    }
    if (node.kind !== "compare") {
        return boolean(facts);
    }
    const left = analyzeNode(node.left, scope, facts);
    const right = analyzeNode(node.right, scope, facts);
    assertComparable(left.value, right.value, node.operator);
    return boolean(comparisonFacts(node, facts));
}

function comparisonFacts(node: Extract<ExpressionNode, { kind: "compare" }>, facts: BindingFacts): BindingFacts {
    const normalized = normalizeComparison(node);
    if (!normalized) {
        return facts;
    }
    const { path, literal, operator } = normalized;
    if (operator === "===") {
        return withFact(facts, path, literal);
    }
    if (path.endsWith(".length") && typeof literal === "number") {
        const arrayPath = path.slice(0, -".length".length);
        if (operator === ">") {
            return withMinimumLength(facts, arrayPath, literal + 1);
        }
        if (operator === ">=") {
            return withMinimumLength(facts, arrayPath, literal);
        }
        if (operator === "!==" && literal === 0) {
            return withMinimumLength(facts, arrayPath, 1);
        }
        if (operator === "<") {
            return withMaximumLength(facts, arrayPath, literal - 1);
        }
        if (operator === "<=") {
            return withMaximumLength(facts, arrayPath, literal);
        }
    }
    return facts;
}

function normalizeComparison(node: Extract<ExpressionNode, { kind: "compare" }>): {
    readonly path: string;
    readonly literal: string | number | boolean | null;
    readonly operator: ExpressionCompareOperator;
} | null {
    if (node.left.kind === "path" && node.right.kind === "literal") {
        return { path: node.left.path, literal: node.right.value, operator: node.operator };
    }
    if (node.right.kind !== "path" || node.left.kind !== "literal") {
        return null;
    }
    return { path: node.right.path, literal: node.left.value, operator: reverse(node.operator) };
}

function reverse(operator: ExpressionCompareOperator): ExpressionCompareOperator {
    return (
        (
            { ">": "<", ">=": "<=", "<": ">", "<=": ">=" } as Partial<
                Record<ExpressionCompareOperator, ExpressionCompareOperator>
            >
        )[operator] ?? operator
    );
}

function assertComparable(left: BindingVariable, right: BindingVariable, operator: ExpressionCompareOperator): void {
    const leftType = valueType(left);
    const rightType = valueType(right);
    if (leftType !== "unknown" && rightType !== "unknown" && leftType !== rightType) {
        throw new ContentValidationError("content", `binding comparison mixes ${leftType} and ${rightType}`);
    }
    if ([">", ">=", "<", "<="].includes(operator) && !["number", "string", "unknown"].includes(leftType)) {
        throw new ContentValidationError("content", `binding ordering is not defined for ${leftType}`);
    }
}

function valueType(variable: BindingVariable): "boolean" | "string" | "number" | "null" | "unknown" {
    if (variable.kind !== "schema") {
        return "unknown";
    }
    if (variable.schema.type === "integer" || variable.schema.type === "number") {
        return "number";
    }
    return ["boolean", "string", "null"].includes(variable.schema.type)
        ? (variable.schema.type as "boolean" | "string" | "null")
        : "unknown";
}

function literalVariable(value: string | number | boolean | null): BindingVariable {
    const type = value === null ? "null" : typeof value === "number" ? "number" : typeof value;
    return { kind: "schema", schema: { type } as never };
}

function boolean(facts: BindingFacts): ExpressionAnalysis {
    return { value: { kind: "schema", schema: { type: "boolean" } }, whenTrue: facts };
}
