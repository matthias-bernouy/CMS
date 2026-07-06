import type { FunctionCondition } from "../interfaces/FunctionDefinition";
import { resolveFunctionValue, type FunctionRuntimeVars } from "./expressions";

export function evaluateCondition(condition: FunctionCondition, vars: FunctionRuntimeVars): boolean {
    if ("equals" in condition) return comparable(condition.equals[0], vars) === comparable(condition.equals[1], vars);
    if ("notEquals" in condition) return comparable(condition.notEquals[0], vars) !== comparable(condition.notEquals[1], vars);
    if ("in" in condition) {
        const needle = resolveFunctionValue(condition.in[0], vars);
        const haystack = resolveFunctionValue(condition.in[1], vars);
        return Array.isArray(haystack) && haystack.some(item => item === needle);
    }
    if ("exists" in condition) {
        const value = resolveFunctionValue(condition.exists, vars);
        return value !== undefined && value !== null;
    }
    if ("gt" in condition) return numberValue(condition.gt[0], vars) > numberValue(condition.gt[1], vars);
    if ("gte" in condition) return numberValue(condition.gte[0], vars) >= numberValue(condition.gte[1], vars);
    if ("lt" in condition) return numberValue(condition.lt[0], vars) < numberValue(condition.lt[1], vars);
    if ("lte" in condition) return numberValue(condition.lte[0], vars) <= numberValue(condition.lte[1], vars);
    if ("any" in condition) return condition.any.some(child => evaluateCondition(child, vars));
    if ("all" in condition) return condition.all.every(child => evaluateCondition(child, vars));
    if ("not" in condition) return !evaluateCondition(condition.not, vars);
    return false;
}

function comparable(value: unknown, vars: FunctionRuntimeVars): unknown {
    const resolved = resolveFunctionValue(value as never, vars);
    if (typeof resolved === "number" || typeof resolved === "string" || typeof resolved === "boolean" || resolved === null || resolved === undefined) {
        return resolved;
    }
    return JSON.stringify(resolved);
}

function numberValue(value: unknown, vars: FunctionRuntimeVars): number {
    const resolved = resolveFunctionValue(value as never, vars);
    return typeof resolved === "number" ? resolved : Number(resolved);
}
