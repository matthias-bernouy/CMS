import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";
import type { IdentityResolver } from "@bernouy/cms-identities";
import type { CmsFunction } from "cms-functions/interfaces/FunctionDefinition";
import { readFunctionInput } from "cms-functions/core/execution/input/readFunctionInput";
import {
    functionErrorResponse,
    projectFunctionOutput,
    serverFailureResponse,
} from "cms-functions/core/execution/output/functionResponses";
import { json } from "cms-functions/core/execution/output/response";
import { runFunctionSteps } from "cms-functions/core/execution/calls/runFunctionSteps";
import { withFunctionExecutionScope } from "cms-functions/core/execution/context/functionExecutionScope";
import {
    FunctionExecutionError,
    PropagatedFunctionCallError,
    UnexpectedFunctionExecutionError,
} from "cms-functions/core/model/errors";
import { resolveFunctionValue, type FunctionRuntimeVars } from "cms-functions/core/model/expressions";

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

export type FunctionFailureReporter = (failure: FunctionExecutionFailure) => void | Promise<void>;

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

        const scopedOptions = withFunctionExecutionScope(options);
        const assertionFailure = await runFunctionSteps(fn.steps, vars, scopedOptions, fn);
        if (assertionFailure) {
            return functionErrorResponse(fn, assertionFailure.status, await assertionFailure.json());
        }

        const status = fn.return.status ?? 200;
        if (status >= 500) {
            return await serverFailureResponse(fn, status, options);
        }
        const body = projectFunctionOutput(fn, status, resolveFunctionValue(fn.return.body, vars));
        return body === undefined ? new Response(null, { status }) : json(body, status);
    } catch (error) {
        if (error instanceof FunctionExecutionError) {
            if (error instanceof PropagatedFunctionCallError) {
                try {
                    return functionErrorResponse(fn, error.status, error.body);
                } catch {
                    return await serverFailureResponse(fn, 500, options, error);
                }
            }
            if (error.status >= 500) {
                return await serverFailureResponse(fn, error.status, options, error);
            }
            const body: Record<string, unknown> = {
                error: error.message,
            };
            if (error.details !== undefined) {
                body.details = error.details;
            }
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
