import {
    DataShapeProjectionError,
    projectStrictDataShape,
} from "@bernouy/cms-sources";
import type { CmsFunction } from "../../interfaces/FunctionDefinition";
import type {
    ExecuteFunctionOptions,
    FunctionExecutionFailure,
    FunctionFailureReporter,
} from "../executeFunction";
import {
    type FunctionExecutionError,
    type FunctionExecutionErrorContext,
} from "../errors";
import { json } from "./response";

export async function serverFailureResponse(
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

export function projectFunctionOutput(fn: CmsFunction, status: number, body: unknown): unknown {
    if (!fn.output?.length) return body;
    const contract = functionOutputContract(fn, status);
    if (!contract) throw new DataShapeProjectionError(`response status ${status} is not declared`);
    if (!contract.body) return undefined;
    return projectStrictDataShape(body, contract.body, "response");
}

export function functionErrorResponse(fn: CmsFunction, status: number, body: unknown): Response {
    const contract = functionOutputContract(fn, status);
    if (!contract) return json(safeFunctionErrorBody(body), status);
    if (!contract.body) return new Response(null, { status });
    return json(projectStrictDataShape(body, contract.body, "response"), status);
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
