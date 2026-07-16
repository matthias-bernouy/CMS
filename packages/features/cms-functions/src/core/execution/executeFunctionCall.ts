import {
    executeEndpoint,
    makeEndpointUrn,
    systemSourceUrnOf,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import type { CmsFunction, FunctionCall } from "../../interfaces/FunctionDefinition";
import type { ExecuteFunctionOptions } from "../executeFunction";
import {
    FunctionExecutionError,
    RecoverableFunctionCallError,
    UnexpectedFunctionExecutionError,
    withFunctionExecutionErrorContext,
    type FunctionExecutionErrorContext,
} from "../errors";
import type { FunctionRuntimeVars } from "../expressions";
import { MAX_FUNCTION_CALL_ERROR_BYTES, MAX_FUNCTION_RESPONSE_BYTES } from "./limits";
import { resolveCallMappings } from "./identityResolution";

export async function executeFunctionCall(
    call: FunctionCall,
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
    definition: CmsFunction,
    stepId: string,
): Promise<unknown> {
    const context: FunctionExecutionErrorContext = {
        stepId,
        source: call.source,
        endpoint: call.endpoint,
    };
    try {
        const endpoint = await options.sources.getEndpoint(makeEndpointUrn(call.source, call.endpoint));
        if (!endpoint) throw new FunctionExecutionError(`Function call endpoint not found: ${call.source}.${call.endpoint}`);
        if (systemSourceUrnOf(endpoint.urn)) throw new FunctionExecutionError(`Function call cannot target system endpoint: ${endpoint.urn}`);
        if (endpoint.responseKind && endpoint.responseKind !== "json") throw new FunctionExecutionError(`Function call target is not JSON: ${endpoint.urn}`);

        const mappings = await resolveCallMappings(definition, call, endpoint, vars, options);
        const response = await executeEndpoint(endpoint, callRequest(endpoint, mappings), options.deps);
        if (!response.ok) throw await callFailureError(call.endpoint, response, options);
        if (endpoint.effects?.invalidatesSchema) {
            options.sources.invalidateSchema?.({ sourceId: call.source });
        }

        const { text, truncated } = await readLimitedText(
            response,
            options.maxResponseBytes ?? MAX_FUNCTION_RESPONSE_BYTES,
        );
        if (truncated) {
            throw new RecoverableFunctionCallError(`Function call "${call.endpoint}" response is too large`);
        }
        if (!text) return null;
        try {
            return JSON.parse(text) as unknown;
        } catch {
            throw new RecoverableFunctionCallError(`Function call "${call.endpoint}" returned invalid JSON`);
        }
    } catch (error) {
        if (error instanceof FunctionExecutionError) {
            throw contextualizeFunctionError(error, context);
        }
        throw new UnexpectedFunctionExecutionError(context, { cause: error });
    }
}

async function callFailureError(endpoint: string, response: Response, options: ExecuteFunctionOptions): Promise<RecoverableFunctionCallError> {
    const message = `Function call "${endpoint}" failed with status ${response.status}`;
    const correlationId = response.headers.get("x-correlation-id") ?? undefined;
    const context: FunctionExecutionErrorContext = { callStatus: response.status };
    if (!options.includeCallErrorDetails) {
        if (response.body) await response.body.cancel().catch(() => undefined);
        return new RecoverableFunctionCallError(message, 502, undefined, correlationId, context);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const { text, truncated } = await readLimitedText(response, options.maxCallErrorBytes ?? MAX_FUNCTION_CALL_ERROR_BYTES);
    const detail: Record<string, unknown> = {
        call: endpoint,
        status: response.status,
        contentType,
        body: parseErrorBody(text, contentType),
    };
    if (truncated) detail.truncated = true;
    return new RecoverableFunctionCallError(message, 502, detail, correlationId, context);
}

function contextualizeFunctionError(
    error: FunctionExecutionError,
    context: FunctionExecutionErrorContext,
): FunctionExecutionError {
    const contextual = withFunctionExecutionErrorContext(error, context);
    if (!(error instanceof RecoverableFunctionCallError)) return contextual;
    return new RecoverableFunctionCallError(
        contextual.message,
        contextual.status,
        contextual.details,
        contextual.correlationId,
        contextual.context,
    );
}

async function readLimitedText(response: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
    if (!response.body) return { text: "", truncated: false };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    let truncated = false;

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        bytes += value.byteLength;
        if (bytes > maxBytes) {
            const remaining = maxBytes - (bytes - value.byteLength);
            if (remaining > 0) text += decoder.decode(value.slice(0, remaining), { stream: true });
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
    if (!text) return null;
    if (!contentType.includes("application/json")) return text;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function callRequest(
    endpoint: SourceEndpoint,
    mappings: { params: Record<string, unknown>; body: unknown },
): Request {
    const url = new URL("https://cms.function/internal");
    for (const [key, value] of Object.entries(mappings.params)) {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const body = mappings.body;
    return new Request(url, {
        method: endpoint.method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}
