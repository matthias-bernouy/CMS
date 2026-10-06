import { evaluateNode } from "./condition/evaluate";
import { parseConditionExpression } from "./condition/parser";
import type { CompiledCondition, ConditionNode } from "./condition/types";
import type { Scope } from "../core/scope";
import { bindingFilter, type FilterMap } from "../core/interpolate";
import { conditionOperands } from "./condition/references";

export type { CompiledCondition } from "./condition/types";
export { collectConditionReferences } from "./condition/references";

export function evaluateCondition(expression: string, scope: Scope, filters: FilterMap = {}): boolean {
    return compileCondition(expression, filters).evaluate(scope);
}

export function compileCondition(expression: string, filters: FilterMap = {}): CompiledCondition {
    const trimmed = expression.trim();
    if (!trimmed) {
        return validCondition(expression, { kind: "literal", value: true }, filters);
    }

    try {
        const root = parseConditionExpression(trimmed);
        for (const operand of conditionOperands(root)) {
            if (operand.kind === "filter" && typeof bindingFilter(operand.name, filters) !== "function") {
                throw new Error(`unknown filter "${operand.name}"`);
            }
        }
        return validCondition(expression, root, filters);
    } catch (error) {
        let warned = false;
        return {
            expression,
            valid: false,
            evaluate: () => {
                if (!warned) {
                    warned = true;
                    console.warn(`Invalid cms-condition "${expression}": ${conditionErrorMessage(error)}`);
                }
                return false;
            },
        };
    }
}

function validCondition(expression: string, root: ConditionNode, filters: FilterMap): CompiledCondition {
    return {
        expression,
        valid: true,
        evaluate: (scope) => Boolean(evaluateNode(root, scope, filters)),
    };
}

function conditionErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
