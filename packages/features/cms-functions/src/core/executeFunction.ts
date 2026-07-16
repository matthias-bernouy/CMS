import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";
import type { IdentityResolver } from "@bernouy/cms-identities";
import type { CmsFunction } from "../interfaces/FunctionDefinition";
import { readFunctionInput } from "./execution/readFunctionInput";
import {
    functionErrorResponse,
    projectFunctionOutput,
    serverFailureResponse,
} from "./execution/functionResponses";
import { json } from "./execution/response";
import { runFunctionSteps } from "./execution/runFunctionSteps";
import {
    FunctionExecutionError,
    UnexpectedFunctionExecutionError,
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
