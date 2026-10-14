import type { CompiledCondition } from "./condition/types";
import type { Scope } from "../core/scope";
import type { FilterMap } from "../core/interpolate";
import { compileExpression } from "./expression";

export type { CompiledCondition } from "./condition/types";
export { collectExpressionReferences as collectConditionReferences } from "cms-content/blocs/core/markup/expression/inspect";

export function evaluateCondition(expression: string, scope: Scope, filters: FilterMap = {}): boolean {
    return compileCondition(expression, filters).evaluate(scope);
}

export function compileCondition(expression: string, filters: FilterMap = {}): CompiledCondition {
    const trimmed = expression.trim();
    if (!trimmed) {
        return { expression, valid: true, evaluate: () => true };
    }
    const compiled = compileExpression(trimmed, filters);
    return {
        expression,
        valid: compiled.valid,
        evaluate: (scope) => Boolean(compiled.evaluate(scope)),
    };
}
