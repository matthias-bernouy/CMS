import { isSourceEndpointAccessMode } from "@bernouy/cms-sources";
import type { CmsFunction } from "cms-functions/interfaces/FunctionDefinition";
import { MAX_FUNCTION_CALLS } from "cms-functions/core/execution/context/limits";
import { isId } from "cms-functions/core/validation/ids";
import type { ValidateFunctionOptions, ValidationState } from "cms-functions/core/validation/state";
import { validateReferences } from "cms-functions/core/validation/validateReferences";
import { validateSteps } from "cms-functions/core/validation/validateSteps";

export type { ValidateFunctionOptions } from "cms-functions/core/validation/state";

export async function validateFunction(fn: CmsFunction, options: ValidateFunctionOptions = {}): Promise<string[]> {
    const errors: string[] = [];
    const maxCalls = options.maxCalls ?? MAX_FUNCTION_CALLS;
    if (!isId(fn.id)) {
        errors.push("function.id must be a simple id");
    }
    if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(fn.method)) {
        errors.push("function.method is not supported");
    }
    validateAccess(fn, errors);
    if (!Array.isArray(fn.steps)) {
        errors.push("function.steps must be an array");
    }
    if (!fn.return) {
        errors.push("function.return is required");
    }

    const state: ValidationState = {
        fn,
        options,
        errors,
        stepIds: new Set<string>(),
        knownStepIds: new Set<string>(),
        stepShapes: new Map(),
    };
    const steps = Array.isArray(fn.steps) ? fn.steps : [];
    const callCount = await validateSteps(steps, "function.steps", state, false);

    if (callCount > maxCalls) {
        errors.push(`function call budget exceeds max (${callCount}, max ${maxCalls})`);
    }
    if (fn.return) {
        validateReferences(fn.return, "function.return", state, false);
        if (fn.return.status !== undefined && (fn.return.status < 200 || fn.return.status > 599)) {
            errors.push("function.return.status must be an HTTP status");
        }
    }
    return errors;
}

function validateAccess(fn: CmsFunction, errors: string[]): void {
    if (fn.access === undefined) {
        return;
    }
    if (!isSourceEndpointAccessMode(fn.access.mode)) {
        errors.push("function.access.mode is not supported");
    }
}
