import type { FunctionCondition } from "cms-functions/interfaces/FunctionDefinition";
import {
    resolveFunctionValue,
    type FunctionRuntimeVars,
    type ReferenceResolver,
} from "cms-functions/core/model/expressions";

export function evaluateCondition<Vars = FunctionRuntimeVars>(
    condition: FunctionCondition,
    vars: Vars,
    resolver?: ReferenceResolver<Vars>,
): boolean {
    if ("equals" in condition) {
        return comparable(condition.equals[0], vars, resolver) === comparable(condition.equals[1], vars, resolver);
    }
    if ("notEquals" in condition) {
        return (
            comparable(condition.notEquals[0], vars, resolver) !== comparable(condition.notEquals[1], vars, resolver)
        );
    }
    if ("in" in condition) {
        const needle = resolveFunctionValue(condition.in[0], vars, resolver);
        const haystack = resolveFunctionValue(condition.in[1], vars, resolver);
        return Array.isArray(haystack) && haystack.some((item) => item === needle);
    }
    if ("exists" in condition) {
        const value = resolveFunctionValue(condition.exists, vars, resolver);
        return value !== undefined && value !== null;
    }
    if ("gt" in condition) {
        return numberValue(condition.gt[0], vars, resolver) > numberValue(condition.gt[1], vars, resolver);
    }
    if ("gte" in condition) {
        return numberValue(condition.gte[0], vars, resolver) >= numberValue(condition.gte[1], vars, resolver);
    }
    if ("lt" in condition) {
        return numberValue(condition.lt[0], vars, resolver) < numberValue(condition.lt[1], vars, resolver);
    }
    if ("lte" in condition) {
        return numberValue(condition.lte[0], vars, resolver) <= numberValue(condition.lte[1], vars, resolver);
    }
    if ("any" in condition) {
        return condition.any.some((child) => evaluateCondition(child, vars, resolver));
    }
    if ("all" in condition) {
        return condition.all.every((child) => evaluateCondition(child, vars, resolver));
    }
    if ("not" in condition) {
        return !evaluateCondition(condition.not, vars, resolver);
    }
    return false;
}

function comparable<Vars>(value: unknown, vars: Vars, resolver: ReferenceResolver<Vars> | undefined): unknown {
    const resolved = resolveFunctionValue(value as never, vars, resolver);
    if (
        typeof resolved === "number" ||
        typeof resolved === "string" ||
        typeof resolved === "boolean" ||
        resolved === null ||
        resolved === undefined
    ) {
        return resolved;
    }
    return JSON.stringify(resolved);
}

function numberValue<Vars>(value: unknown, vars: Vars, resolver: ReferenceResolver<Vars> | undefined): number {
    const resolved = resolveFunctionValue(value as never, vars, resolver);
    return typeof resolved === "number" ? resolved : Number(resolved);
}
