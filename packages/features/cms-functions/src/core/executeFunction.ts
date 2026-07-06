import {
    executeEndpoint,
    makeEndpointUrn,
    systemSourceUrnOf,
    type DataShape,
    type ExecutorDeps,
    type SourceEndpoint,
    type SourceRepository,
} from "@bernouy/cms-sources";
import { evaluateCondition } from "./conditions";
import { FunctionExecutionError } from "./errors";
import { resolveFunctionValue, type FunctionRuntimeVars } from "./expressions";
import type { CmsFunction, FunctionCall, FunctionValue } from "../interfaces/FunctionDefinition";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type FunctionUserContext = {
    id?: string;
    role?: string;
};

export type ExecuteFunctionOptions = {
    sources: SourceRepository;
    deps?: ExecutorDeps;
    user?: FunctionUserContext;
    maxResponseBytes?: number;
};

export async function executeFunction(fn: CmsFunction, request: Request, options: ExecuteFunctionOptions): Promise<Response> {
    try {
        const vars: FunctionRuntimeVars = {
            input: await readFunctionInput(fn, request),
            ctx: { user: options.user ?? {} },
            steps: {},
        };

        for (const step of fn.steps) {
            if ("assert" in step) {
                if (!evaluateCondition(step.assert.condition, vars)) {
                    const failure = step.assert.failure ?? {};
                    return json({ error: failure.error ?? "Forbidden" }, failure.status ?? 403);
                }
                continue;
            }

            const data = await executeCall(step.call, vars, options);
            vars.steps![step.id] = data;
        }

        const status = fn.return.status ?? 200;
        const body = resolveFunctionValue(fn.return.body, vars);
        return body === undefined ? new Response(null, { status }) : json(body, status);
    } catch (error) {
        if (error instanceof FunctionExecutionError) return json({ error: error.message }, error.status);
        return json({ error: "Function execution failed" }, 500);
    }
}

async function executeCall(call: FunctionCall, vars: FunctionRuntimeVars, options: ExecuteFunctionOptions): Promise<unknown> {
    const endpoint = await options.sources.getEndpoint(makeEndpointUrn(call.source, call.endpoint));
    if (!endpoint) throw new FunctionExecutionError(`Function call endpoint not found: ${call.source}.${call.endpoint}`);
    if (systemSourceUrnOf(endpoint.urn)) throw new FunctionExecutionError(`Function call cannot target system endpoint: ${endpoint.urn}`);
    if (endpoint.responseKind && endpoint.responseKind !== "json") throw new FunctionExecutionError(`Function call target is not JSON: ${endpoint.urn}`);

    const request = callRequest(endpoint, call, vars);
    const response = await executeEndpoint(endpoint, request, options.deps);
    if (!response.ok) throw new FunctionExecutionError(`Function call "${call.endpoint}" failed with status ${response.status}`, 502);

    const text = await response.text();
    if (text.length > (options.maxResponseBytes ?? MAX_RESPONSE_BYTES)) {
        throw new FunctionExecutionError(`Function call "${call.endpoint}" response is too large`);
    }
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new FunctionExecutionError(`Function call "${call.endpoint}" returned invalid JSON`);
    }
}

function callRequest(endpoint: SourceEndpoint, call: FunctionCall, vars: FunctionRuntimeVars): Request {
    const url = new URL("https://cms.function/internal");
    const params = resolveObject(call.params, vars);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const body = resolveFunctionValue(call.body, vars);
    return new Request(url, {
        method: endpoint.method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

async function readFunctionInput(fn: CmsFunction, request: Request): Promise<NonNullable<FunctionRuntimeVars["input"]>> {
    const url = new URL(request.url);
    const params: Record<string, unknown> = {};
    for (const [name, shape] of Object.entries(fn.input?.params ?? {})) {
        const raw = url.searchParams.get(name);
        if (raw !== null) params[name] = coerceParam(raw, shape, `params.${name}`);
    }

    const input: NonNullable<FunctionRuntimeVars["input"]> = { params };
    if (fn.input?.body && request.method !== "GET" && request.body !== null) {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            throw new FunctionExecutionError("Invalid JSON body", 400);
        }
        assertShape(body, fn.input.body, "body");
        input.body = body;
    }
    return input;
}

function coerceParam(value: string, shape: DataShape, path: string): unknown {
    if (shape.type === "number") {
        const next = Number(value);
        if (!Number.isFinite(next)) throw new FunctionExecutionError(`${path} must be a number`, 400);
        return next;
    }
    if (shape.type === "boolean") {
        if (value === "true" || value === "1") return true;
        if (value === "false" || value === "0") return false;
        throw new FunctionExecutionError(`${path} must be a boolean`, 400);
    }
    return value;
}

function assertShape(value: unknown, shape: DataShape, path: string): void {
    if (shape.type === "object") {
        if (!isRecord(value)) throw new FunctionExecutionError(`${path} must be an object`, 400);
        for (const key of shape.required ?? []) {
            if (!Object.hasOwn(value, key)) throw new FunctionExecutionError(`${path}.${key} is required`, 400);
        }
        for (const [key, child] of Object.entries(shape.properties ?? {})) {
            if (Object.hasOwn(value, key)) assertShape(value[key], child, `${path}.${key}`);
        }
        return;
    }
    if (shape.type === "array") {
        if (!Array.isArray(value)) throw new FunctionExecutionError(`${path} must be an array`, 400);
        if (shape.items) value.forEach((item, index) => assertShape(item, shape.items!, `${path}.${index}`));
        return;
    }
    if (typeof value !== shape.type) throw new FunctionExecutionError(`${path} must be a ${shape.type}`, 400);
}

function resolveObject(value: Record<string, FunctionValue> | undefined, vars: FunctionRuntimeVars): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, resolveFunctionValue(item, vars)]));
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
