import type { ExecuteFunctionOptions } from "cms-functions/core/execution/executeFunction";
import { MAX_FUNCTION_CALL_ERROR_BYTES } from "cms-functions/core/execution/context/limits";
import {
    FunctionExecutionError,
    RecoverableFunctionCallError,
    withFunctionExecutionErrorContext,
    type FunctionExecutionErrorContext,
} from "cms-functions/core/model/errors";

export async function callFailureError(
    endpoint: string,
    response: Response,
    options: ExecuteFunctionOptions,
): Promise<RecoverableFunctionCallError> {
    const message = `Function call "${endpoint}" failed with status ${response.status}`;
    const correlationId = response.headers.get("x-correlation-id") ?? undefined;
    const context: FunctionExecutionErrorContext = { callStatus: response.status };
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
        call: endpoint,
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

export async function readLimitedText(
    response: Response,
    maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
    if (!response.body) {
        return { text: "", truncated: false };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    let truncated = false;
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        bytes += value.byteLength;
        if (bytes > maxBytes) {
            const remaining = maxBytes - (bytes - value.byteLength);
            if (remaining > 0) {
                text += decoder.decode(value.slice(0, remaining), { stream: true });
            }
            truncated = true;
            await reader.cancel();
            break;
        }
        text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, truncated };
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
