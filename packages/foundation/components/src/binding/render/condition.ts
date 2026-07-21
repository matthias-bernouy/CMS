import { evaluateNode } from "./condition/evaluate";
import { parseConditionExpression } from "./condition/parser";
import type { CompiledCondition, ConditionNode } from "./condition/types";
import type { Scope } from "../scope";

export type { CompiledCondition } from "./condition/types";
export { collectConditionReferences } from "./condition/references";

export function evaluateCondition(expression: string, scope: Scope): boolean {
    return compileCondition(expression).evaluate(scope);
}

export function compileCondition(expression: string): CompiledCondition {
    const trimmed = expression.trim();
    if (!trimmed) {
        return validCondition(expression, { kind: "literal", value: true });
    }

    try {
        return validCondition(expression, parseConditionExpression(trimmed));
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

function validCondition(expression: string, root: ConditionNode): CompiledCondition {
    return {
        expression,
        valid: true,
        evaluate: (scope) => Boolean(evaluateNode(root, scope)),
    };
}

function conditionErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
