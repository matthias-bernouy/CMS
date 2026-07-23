import type { SourceEndpoint } from "@bernouy/cms-sources";
import type { ExecuteFunctionOptions } from "cms-functions/core/execution/executeFunction";
import { MAX_FUNCTION_CALL_ERROR_BYTES } from "cms-functions/core/execution/context/limits";
import type { CmsFunction, FunctionCall } from "cms-functions/interfaces/FunctionDefinition";
import { readLimitedText } from "cms-functions/core/execution/calls/callBody";
import { propagatedCallFailureError } from "cms-functions/core/execution/calls/callErrorPropagation";
import {
    FunctionExecutionError,
    PropagatedFunctionCallError,
    RecoverableFunctionCallError,
    withFunctionExecutionErrorContext,
    type FunctionExecutionErrorContext,
} from "cms-functions/core/model/errors";

export async function callFailureError(
    call: FunctionCall,
    endpoint: SourceEndpoint,
    definition: CmsFunction,
    response: Response,
    options: ExecuteFunctionOptions,
): Promise<RecoverableFunctionCallError> {
    const message = `Function call "${call.endpoint}" failed with status ${response.status}`;
    const correlationId = response.headers.get("x-correlation-id") ?? undefined;
    const context: FunctionExecutionErrorContext = { callStatus: response.status };
    const propagated = await propagatedCallFailureError(call, endpoint, definition, response, options, context);
    if (propagated) {
        return propagated;
    }
    if (!options.includeCallErrorDetails) {
        if (response.body) {
            await response.body.cancel().catch(() => undefined);
        }
        return new RecoverableFunctionCallError(message, 502, undefined, correlationId, context);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const { text, truncated } = await readLimitedText(
        response,
        options.maxCallErrorBytes ?? MAX_FUNCTION_CALL_ERROR_BYTES,
    );
    const detail: Record<string, unknown> = {
        call: call.endpoint,
        status: response.status,
        contentType,
        body: parseErrorBody(text, contentType),
    };
    if (truncated) {
        detail.truncated = true;
    }
    return new RecoverableFunctionCallError(message, 502, detail, correlationId, context);
}

export function contextualizeFunctionError(
    error: FunctionExecutionError,
    context: FunctionExecutionErrorContext,
): FunctionExecutionError {
    const contextual = withFunctionExecutionErrorContext(error, context);
    if (error instanceof PropagatedFunctionCallError) {
        return new PropagatedFunctionCallError(contextual.message, contextual.status, error.body, contextual.context);
    }
    if (!(error instanceof RecoverableFunctionCallError)) {
        return contextual;
    }
    return new RecoverableFunctionCallError(
        contextual.message,
        contextual.status,
        contextual.details,
        contextual.correlationId,
        contextual.context,
    );
}

function parseErrorBody(text: string, contentType: string): unknown {
    if (!text) {
        return null;
    }
    if (!contentType.includes("application/json")) {
        return text;
    }
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}
