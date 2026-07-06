import {
    makeEndpointUrn,
    systemSourceUrnOf,
    type DataShape,
    type SourceEndpoint,
    type SourceRepository,
} from "@bernouy/cms-sources";
import { collectReferences } from "./expressions";
import { SYSTEM_FUNCTIONS_SOURCE_ID } from "./projection";
import type { CmsFunction, FunctionCall, FunctionStep, FunctionValue } from "../interfaces/FunctionDefinition";

export type ValidateFunctionOptions = {
    sources?: SourceRepository | null;
    maxCalls?: number;
};

export async function validateFunction(fn: CmsFunction, options: ValidateFunctionOptions = {}): Promise<string[]> {
    const errors: string[] = [];
    const maxCalls = options.maxCalls ?? 10;
    if (!isId(fn.id)) errors.push("function.id must be a simple id");
    if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(fn.method)) errors.push("function.method is not supported");
    if (!Array.isArray(fn.steps)) errors.push("function.steps must be an array");
    if (!fn.return) errors.push("function.return is required");

    const stepIds = new Set<string>();
    const knownStepIds = new Set<string>();
    const stepShapes = new Map<string, DataShape | null>();
    let callCount = 0;

    for (const [index, step] of (fn.steps ?? []).entries()) {
        const path = `function.steps.${index}`;
        validateBackwardRefs(step, path, knownStepIds, fn, stepShapes, errors);
        if ("call" in step) {
            callCount += 1;
            if (!isId(step.id)) errors.push(`${path}.id must be a simple id`);
            if (stepIds.has(step.id)) errors.push(`duplicate step id "${step.id}"`);
            stepIds.add(step.id);
            const endpoint = await validateCall(fn, step.call, `${path}.call`, options.sources ?? null, errors);
            stepShapes.set(step.id, endpoint ? endpointOutputShape(endpoint) : null);
            knownStepIds.add(step.id);
        } else if ("assert" in step) {
            validateReferences(step.assert.condition, `${path}.assert.condition`, knownStepIds, fn, stepShapes, errors);
            if (step.assert.failure?.status !== undefined && !validFailureStatus(step.assert.failure.status)) {
                errors.push(`${path}.assert.failure.status must be an HTTP error status`);
            }
        } else {
            errors.push(`${path} must declare call or assert`);
        }
    }

    if (callCount > maxCalls) errors.push(`function has too many calls (${callCount}, max ${maxCalls})`);
    validateReferences(fn.return, "function.return", knownStepIds, fn, stepShapes, errors);
    if (fn.return.status !== undefined && (fn.return.status < 200 || fn.return.status > 599)) {
        errors.push("function.return.status must be an HTTP status");
    }
    return errors;
}

async function validateCall(
    fn: CmsFunction,
    call: FunctionCall,
    path: string,
    sources: SourceRepository | null,
    errors: string[],
): Promise<SourceEndpoint | null> {
    if (!isId(call.source)) errors.push(`${path}.source must be a simple source id`);
    if (!isId(call.endpoint)) errors.push(`${path}.endpoint must be a simple endpoint id`);
    if (call.source === SYSTEM_FUNCTIONS_SOURCE_ID || call.source.startsWith("system-")) {
        errors.push(`${path}.source must not reference a system source`);
        return null;
    }
    if (!sources) return null;
    const endpoint = await sources.getEndpoint(makeEndpointUrn(call.source, call.endpoint));
    if (!endpoint) {
        errors.push(`${path} references unknown endpoint "urn:${call.source}:${call.endpoint}"`);
        return null;
    }
    if (systemSourceUrnOf(endpoint.urn)) errors.push(`${path} must not reference a system endpoint`);
    if (endpoint.responseKind && endpoint.responseKind !== "json") errors.push(`${path} must reference a JSON endpoint`);
    if (fn.method === "GET" && endpoint.method !== "GET") errors.push(`${path} cannot call ${endpoint.method} from a GET function`);
    validateCallParams(call, endpoint, path, errors);
    return endpoint;
}

function validateCallParams(call: FunctionCall, endpoint: SourceEndpoint, path: string, errors: string[]): void {
    const params = endpoint.input?.params ?? [];
    const declared = new Set(params.map(param => param.name));
    for (const key of Object.keys(call.params ?? {})) {
        if (!declared.has(key)) errors.push(`${path}.params.${key} is not declared by endpoint "${endpoint.urn}"`);
    }
    for (const param of params) {
        if (param.required && param.source?.from !== "computed" && call.params?.[param.name] === undefined) {
            errors.push(`${path}.params.${param.name} is required by endpoint "${endpoint.urn}"`);
        }
    }
    const body = endpoint.input?.body;
    if (body && body.type === "object" && isPlainObject(call.body)) {
        for (const key of body.required ?? []) {
            if (!Object.hasOwn(call.body, key)) errors.push(`${path}.body.${key} is required by endpoint "${endpoint.urn}"`);
        }
    }
}

function validateBackwardRefs(
    step: FunctionStep,
    path: string,
    knownStepIds: Set<string>,
    fn: CmsFunction,
    stepShapes: Map<string, DataShape | null>,
    errors: string[],
): void {
    validateReferences(step, path, knownStepIds, fn, stepShapes, errors);
}

function validateReferences(
    value: unknown,
    path: string,
    knownStepIds: Set<string>,
    fn: CmsFunction,
    stepShapes: Map<string, DataShape | null>,
    errors: string[],
): void {
    for (const ref of collectReferences(value)) {
        if (ref.startsWith("$input.params.")) {
            const name = ref.slice("$input.params.".length).split(".")[0] ?? "";
            if (!fn.input?.params?.[name]) errors.push(`${path} references unknown input param "${name}"`);
            continue;
        }
        if (ref.startsWith("$input.body")) {
            if (!fn.input?.body) errors.push(`${path} references input body but no body shape is declared`);
            continue;
        }
        if (ref.startsWith("$ctx.user.")) continue;
        if (ref.startsWith("$steps.")) {
            const [stepId, ...parts] = ref.slice("$steps.".length).split(".");
            if (!stepId || !knownStepIds.has(stepId)) {
                errors.push(`${path} references unknown or future step "${stepId}"`);
                continue;
            }
            const shape = stepShapes.get(stepId) ?? null;
            if (shape && parts.length && !shapeHasPath(shape, parts)) {
                errors.push(`${path} references unknown output path "${ref}"`);
            }
            continue;
        }
        errors.push(`${path} has an invalid reference "${ref}"`);
    }
}

function endpointOutputShape(endpoint: SourceEndpoint): DataShape | null {
    return endpoint.output?.find(response => response.status.startsWith("2") && response.body)?.body ?? null;
}

function shapeHasPath(shape: DataShape, parts: string[]): boolean {
    let current: DataShape | undefined = shape;
    for (const part of parts) {
        if (!current) return false;
        if (current.type === "array") current = current.items;
        if (!current) return false;
        if (current.type !== "object") return false;
        current = current.properties?.[part];
    }
    return current !== undefined;
}

function validFailureStatus(status: number): boolean {
    return Number.isInteger(status) && status >= 400 && status <= 599;
}

function isId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function isPlainObject(value: FunctionValue | undefined): value is Record<string, FunctionValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
