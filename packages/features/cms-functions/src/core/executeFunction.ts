import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";
import type { CmsFunction } from "../interfaces/FunctionDefinition";
import { readFunctionInput } from "./execution/readFunctionInput";
import { json } from "./execution/response";
import { runFunctionSteps } from "./execution/runFunctionSteps";
import { FunctionExecutionError } from "./errors";
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
};

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

        const assertionFailure = await runFunctionSteps(fn.steps, vars, options);
        if (assertionFailure) return assertionFailure;

        const status = fn.return.status ?? 200;
        const body = resolveFunctionValue(fn.return.body, vars);
        return body === undefined ? new Response(null, { status }) : json(body, status);
    } catch (error) {
        if (error instanceof FunctionExecutionError) return json({ error: error.message }, error.status);
        return json({ error: "Function execution failed" }, 500);
    }
}
