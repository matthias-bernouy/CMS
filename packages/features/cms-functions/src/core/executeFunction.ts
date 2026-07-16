import {
    DataShapeProjectionError,
    projectStrictDataShape,
    type ExecutorDeps,
    type SourceRepository,
} from "@bernouy/cms-sources";
import type { IdentityResolver } from "@bernouy/cms-identities";
import type { CmsFunction } from "../interfaces/FunctionDefinition";
import { readFunctionInput } from "./execution/readFunctionInput";
import { json } from "./execution/response";
import { runFunctionSteps } from "./execution/runFunctionSteps";
import {
    FunctionExecutionError,
    UnexpectedFunctionExecutionError,
    type FunctionExecutionErrorContext,
} from "./errors";
import { resolveFunctionValue, type FunctionRuntimeVars } from "./expressions";

export type FunctionUserContext = {
    id?: string;
    role?: string;
};

export type ExecuteFunctionOptions = {
    sources: SourceRepository;
    deps?: ExecutorDeps;
    user?: FunctionUserContext;
    maxResponseBytes?: number;
    includeCallErrorDetails?: boolean;
    maxCallErrorBytes?: number;
    identities?: IdentityResolver;
    reportFailure?: FunctionFailureReporter;
};

export type FunctionExecutionFailure = {
    kind: "function_execution_failure";
    correlationId: string;
    functionId: string;
    status: number;
    stepId?: string;
    source?: string;
    endpoint?: string;
    callStatus?: number;
};

export type FunctionFailureReporter = (
    failure: FunctionExecutionFailure,
) => void | Promise<void>;

export async function executeFunction(
    fn: CmsFunction,
    request: Request,
    options: ExecuteFunctionOptions,
): Promise<Response> {
    try {
        const vars: FunctionRuntimeVars = {
            input: await readFunctionInput(fn, request),
            ctx: { user: options.user ?? {} },
            steps: {},
        };

        const scopedOptions = withFunctionUserContext(options);
        const assertionFailure = await runFunctionSteps(fn.steps, vars, scopedOptions, fn);
        if (assertionFailure) {
            return functionErrorResponse(fn, assertionFailure.status, await assertionFailure.json());
        }

        const status = fn.return.status ?? 200;
        if (status >= 500) return await serverFailureResponse(fn, status, options);
        const body = projectFunctionOutput(fn, status, resolveFunctionValue(fn.return.body, vars));
        return body === undefined ? new Response(null, { status }) : json(body, status);
    } catch (error) {
        if (error instanceof FunctionExecutionError) {
            if (error.status >= 500) {
                return await serverFailureResponse(fn, error.status, options, error);
            }
            const body: Record<string, unknown> = {
                error: error.message,
            };
            if (error.details !== undefined) body.details = error.details;
            try {
                return functionErrorResponse(fn, error.status, body);
            } catch {
                return await serverFailureResponse(fn, 500, options);
            }
        }
        if (error instanceof UnexpectedFunctionExecutionError) {
            return await serverFailureResponse(fn, 500, options, undefined, error.context);
        }
        return await serverFailureResponse(fn, 500, options);
    }
}

async function serverFailureResponse(
    fn: CmsFunction,
    status: number,
    options: ExecuteFunctionOptions,
    error?: FunctionExecutionError,
    unexpectedContext: FunctionExecutionErrorContext = {},
): Promise<Response> {
    const safeStatus = status >= 500 && status <= 599 ? status : 500;
    const correlationId = error?.correlationId ?? crypto.randomUUID();
    const context = error?.context ?? unexpectedContext;
    const failure: FunctionExecutionFailure = {
        kind: "function_execution_failure",
        correlationId,
        functionId: fn.id,
        status: safeStatus,
        ...(context.stepId ? { stepId: context.stepId } : {}),
        ...(context.source ? { source: context.source } : {}),
        ...(context.endpoint ? { endpoint: context.endpoint } : {}),
        ...(context.callStatus !== undefined ? { callStatus: context.callStatus } : {}),
    };
    await reportFunctionFailure(failure, options.reportFailure);
    return new Response(JSON.stringify({
        error: "Function execution failed",
        correlationId,
    }), {
        status: safeStatus,
        headers: {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
            "x-content-type-options": "nosniff",
            "x-correlation-id": correlationId,
        },
    });
}

async function reportFunctionFailure(
    failure: FunctionExecutionFailure,
    reporter: FunctionFailureReporter | undefined,
): Promise<void> {
    try {
        if (reporter) {
            await reporter(failure);
            return;
        }
        console.error(JSON.stringify({ scope: "cms-functions", ...failure }));
    } catch {
        // Observability must never alter the safe client response.
    }
}

function projectFunctionOutput(fn: CmsFunction, status: number, body: unknown): unknown {
    if (!fn.output?.length) return body;
    const contract = functionOutputContract(fn, status);
    if (!contract) throw new DataShapeProjectionError(`response status ${status} is not declared`);
    if (!contract.body) return undefined;
    return projectStrictDataShape(body, contract.body, "response");
}

function functionErrorResponse(fn: CmsFunction, status: number, body: unknown): Response {
    const contract = functionOutputContract(fn, status);
    if (!contract) return json(safeFunctionErrorBody(body), status);
    if (!contract.body) return new Response(null, { status });
    return json(projectStrictDataShape(body, contract.body, "response"), status);
}

function functionOutputContract(fn: CmsFunction, status: number) {
    return fn.output?.find(output => output.status === String(status))
        ?? fn.output?.find(output => output.status === "default");
}

function safeFunctionErrorBody(body: unknown): { error: string } {
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
        const error = (body as Record<string, unknown>).error;
        if (typeof error === "string") return { error };
    }
    return { error: "Function execution failed" };
}

function withFunctionUserContext(options: ExecuteFunctionOptions): ExecuteFunctionOptions {
    const originalResolveContext = options.deps?.resolveContext;
    const userID = options.user?.id;
    const userRole = options.user?.role;
    return {
        ...options,
        deps: {
            ...options.deps,
            resolveContext: async request => ({
                ...(originalResolveContext ? await originalResolveContext(request) : {}),
                ...(userID ? { userID } : {}),
                ...(userRole ? { userRole } : {}),
            }),
        },
    };
}
