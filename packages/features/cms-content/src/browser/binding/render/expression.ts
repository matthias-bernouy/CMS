import { expressionOperands } from "cms-content/blocs/core/markup/expression/inspect";
import { parseBindingExpression } from "cms-content/blocs/core/markup/expression/parser";
import type { ExpressionNode } from "cms-content/blocs/core/markup/expression/types";
import { bindingFilter, type FilterMap } from "../core/interpolate";
import type { Scope } from "../core/scope";
import { evaluateNode } from "./condition/evaluate";

export type CompiledExpression = {
    readonly expression: string;
    readonly valid: boolean;
    evaluate(scope: Scope): unknown;
};

export function compileExpression(expression: string, filters: FilterMap = {}): CompiledExpression {
    try {
        const root = parseBindingExpression(expression.trim());
        assertKnownFilters(root, filters);
        return { expression, valid: true, evaluate: (scope) => evaluateNode(root, scope, filters) };
    } catch (error) {
        let warned = false;
        return {
            expression,
            valid: false,
            evaluate: () => {
                if (!warned) {
                    warned = true;
                    console.warn(`Invalid binding expression "${expression}": ${errorMessage(error)}`);
                }
                return undefined;
            },
        };
    }
}

function assertKnownFilters(root: ExpressionNode, filters: FilterMap): void {
    for (const operand of expressionOperands(root)) {
        if (operand.kind === "filter" && typeof bindingFilter(operand.name, filters) !== "function") {
            throw new Error(`unknown filter "${operand.name}"`);
        }
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
