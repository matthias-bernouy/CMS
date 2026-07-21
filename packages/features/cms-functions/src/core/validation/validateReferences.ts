import { collectReferences } from "../expressions";
import { shapeHasPath } from "./shapes";
import type { ValidationState } from "./state";

export function validateReferences(value: unknown, path: string, state: ValidationState, inLoop: boolean): void {
    for (const ref of collectReferences(value)) {
        if (ref === "$item" || ref.startsWith("$item.")) {
            if (!inLoop) {
                state.errors.push(`${path} has an invalid reference "${ref}"`);
            }
            continue;
        }
        if (ref === "$index") {
            if (!inLoop) {
                state.errors.push(`${path} has an invalid reference "${ref}"`);
            }
            continue;
        }
        if (ref.startsWith("$input.params.")) {
            const name = ref.slice("$input.params.".length).split(".")[0] ?? "";
            if (!state.fn.input?.params?.[name]) {
                state.errors.push(`${path} references unknown input param "${name}"`);
            }
            continue;
        }
        if (ref.startsWith("$input.body")) {
            if (!state.fn.input?.body) {
                state.errors.push(`${path} references input body but no body shape is declared`);
            }
            continue;
        }
        if (ref.startsWith("$ctx.user.")) {
            continue;
        }
        if (ref.startsWith("$steps.")) {
            validateStepReference(ref, path, state);
            continue;
        }
        state.errors.push(`${path} has an invalid reference "${ref}"`);
    }
}

function validateStepReference(ref: string, path: string, state: ValidationState): void {
    const [stepId, ...parts] = ref.slice("$steps.".length).split(".");
    if (!stepId || !state.knownStepIds.has(stepId)) {
        state.errors.push(`${path} references unknown or future step "${stepId}"`);
        return;
    }
    const shape = state.stepShapes.get(stepId) ?? null;
    if (shape && parts.length && !shapeHasPath(shape, parts)) {
        state.errors.push(`${path} references unknown output path "${ref}"`);
    }
}
