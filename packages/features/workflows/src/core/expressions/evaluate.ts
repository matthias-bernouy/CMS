import { canonicalizeIJson, MAX_CAPABILITY_JSON_BYTES } from "@bernouy/ulvia-contracts/protocol";
import type { WorkflowExpression } from "workflows/interfaces/definition";
import { valueAt } from "../paths";
import { workflowIssue, WorkflowError } from "../errors";
export interface ExpressionValues {
    readonly input: unknown;
    readonly parameter?: unknown;
    readonly trigger?: unknown;
    readonly steps: Readonly<Record<string, unknown>>;
    readonly errors: Readonly<Record<string, unknown>>;
}
/** Charge references before constructing an expanded value, so repetition cannot allocate an unbounded JSON result. */
export function evaluateExpression(
    expression: WorkflowExpression,
    scope: ExpressionValues,
    maximumBytes = MAX_CAPABILITY_JSON_BYTES,
): unknown {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > MAX_CAPABILITY_JSON_BYTES) {
        throw new WorkflowError("INVALID_INPUT");
    }
    let size = 0;
    const serializations = new Map<unknown, string>();
    const serialized = (value: unknown) => {
        let json = serializations.get(value);
        if (json === undefined) {
            json = canonicalizeIJson(value);
            serializations.set(value, json);
        }
        return json;
    };
    const charge = (bytes: number) => {
        size += bytes;
        if (size > maximumBytes) {
            throw new WorkflowError("VALUE_TOO_LARGE");
        }
    };
    const reference = (node: WorkflowExpression): unknown => {
        if (node.kind === "input") {
            return valueAt(scope.input, node.path);
        }
        if (node.kind === "parameter") {
            return valueAt(scope.parameter, node.path);
        }
        if (node.kind === "trigger") {
            return valueAt(scope.trigger, node.path);
        }
        if (node.kind === "step") {
            return valueAt(scope.steps[node.stepId], node.path);
        }
        if (node.kind === "error") {
            return valueAt(scope.errors[node.stepId], node.path);
        }
        return workflowIssue("condition.reference");
    };
    const evaluate = (node: WorkflowExpression): unknown => {
        if (["literal", "input", "parameter", "trigger", "step", "error"].includes(node.kind)) {
            const value = node.kind === "literal" ? node.value : reference(node);
            charge(new TextEncoder().encode(serialized(value)).byteLength);
            return value;
        }
        switch (node.kind) {
            case "object": {
                charge(2);
                return Object.fromEntries(
                    Object.entries(node.fields).map(([key, child]) => {
                        charge(new TextEncoder().encode(JSON.stringify(key)).byteLength + 2);
                        return [key, evaluate(child)];
                    }),
                );
            }
            case "array":
                charge(2 + node.items.length);
                return node.items.map(evaluate);
            case "exists": {
                try {
                    return reference(node.value) !== undefined;
                } catch (error) {
                    if (error instanceof WorkflowError && error.code === "INVALID_DEFINITION") {
                        return false;
                    }
                    throw error;
                }
            }
            case "compare": {
                const left = evaluate(node.left);
                const right = evaluate(node.right);
                if (node.operator === "eq") {
                    return serialized(left) === serialized(right);
                }
                if (typeof left !== "number" || typeof right !== "number") {
                    workflowIssue("condition.numeric");
                }
                return node.operator === "gt" ? left > right : left < right;
            }
            default:
                return workflowIssue("expression.invalid");
        }
    };
    return evaluate(expression);
}
