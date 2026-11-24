import { canonicalizeIJson, MAX_CAPABILITY_JSON_BYTES } from "@bernouy/ulvia-contracts/protocol";
import type { WorkflowExpression } from "workflows/interfaces/definition";
import type { WorkflowRun } from "workflows/interfaces/store";
import type { WorkflowServices } from "workflows/interfaces/services";
import type { ExpressionValues } from "workflows/core/expressions/evaluate";
import { WorkflowError } from "workflows/core/errors";
export async function executionScope(
    expression: WorkflowExpression,
    run: WorkflowRun,
    services: WorkflowServices,
    parameter: unknown = {},
): Promise<ExpressionValues> {
    const references = new Set<string>();
    const visit = (value: WorkflowExpression) => {
        if (value.kind === "input" || value.kind === "trigger") {
            references.add(value.kind);
        } else if (value.kind === "step" || value.kind === "error") {
            references.add(`${value.kind}:${value.stepId}`);
        } else if (value.kind === "object") {
            Object.values(value.fields).forEach(visit);
        } else if (value.kind === "array") {
            value.items.forEach(visit);
        } else if (value.kind === "compare") {
            visit(value.left);
            visit(value.right);
        } else if (value.kind === "exists") {
            visit(value.value);
        }
    };
    visit(expression);
    let loaded = 0;
    const get = async (reference: string | undefined) => {
        if (!reference) {
            throw new WorkflowError("VALUE_UNAVAILABLE");
        }
        const value = await services.values.get(run.id, reference);
        loaded += new TextEncoder().encode(canonicalizeIJson(value)).byteLength;
        if (loaded > MAX_CAPABILITY_JSON_BYTES) {
            throw new WorkflowError("VALUE_TOO_LARGE");
        }
        return value;
    };
    const steps: Record<string, unknown> = Object.create(null);
    const errors: Record<string, unknown> = Object.create(null);
    for (const reference of references) {
        if (reference.startsWith("step:")) {
            const id = reference.slice(5);
            steps[id] = await get(run.steps[id]?.outputRef);
        }
        if (reference.startsWith("error:")) {
            const id = reference.slice(6);
            errors[id] = await get(run.steps[id]?.errorRef);
        }
    }
    return {
        parameter,
        input: references.has("input") ? await get(run.inputRef) : {},
        ...(references.has("trigger") ? { trigger: await get(run.triggerRef) } : {}),
        steps,
        errors,
    };
}
