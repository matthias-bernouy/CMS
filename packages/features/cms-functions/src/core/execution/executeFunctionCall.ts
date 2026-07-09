import {
    executeEndpoint,
    makeEndpointUrn,
    systemSourceUrnOf,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import type { FunctionCall, FunctionValue } from "../../interfaces/FunctionDefinition";
import type { ExecuteFunctionOptions } from "../executeFunction";
import { FunctionExecutionError } from "../errors";
import { resolveFunctionValue, type FunctionRuntimeVars } from "../expressions";
import { MAX_FUNCTION_CALL_ERROR_BYTES, MAX_FUNCTION_RESPONSE_BYTES } from "./limits";

export async function executeFunctionCall(
    call: FunctionCall,
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
): Promise<unknown> {
    const endpoint = await options.sources.getEndpoint(makeEndpointUrn(call.source, call.endpoint));
    if (!endpoint) throw new FunctionExecutionError(`Function call endpoint not found: ${call.source}.${call.endpoint}`);
    if (systemSourceUrnOf(endpoint.urn)) throw new FunctionExecutionError(`Function call cannot target system endpoint: ${endpoint.urn}`);
    if (endpoint.responseKind && endpoint.responseKind !== "json") throw new FunctionExecutionError(`Function call target is not JSON: ${endpoint.urn}`);

    const response = await executeEndpoint(endpoint, callRequest(endpoint, call, vars), options.deps);
    if (!response.ok) throw await callFailureError(call.endpoint, response, options);

    const text = await response.text();
    if (text.length > (options.maxResponseBytes ?? MAX_FUNCTION_RESPONSE_BYTES)) {
        throw new FunctionExecutionError(`Function call "${call.endpoint}" response is too large`);
    }
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new FunctionExecutionError(`Function call "${call.endpoint}" returned invalid JSON`);
    }
}

async function callFailureError(endpoint: string, response: Response, options: ExecuteFunctionOptions): Promise<FunctionExecutionError> {
    const message = `Function call "${endpoint}" failed with status ${response.status}`;
    if (!options.includeCallErrorDetails) return new FunctionExecutionError(message, 502);

    const contentType = response.headers.get("content-type") ?? "";
    const { text, truncated } = await readLimitedText(response, options.maxCallErrorBytes ?? MAX_FUNCTION_CALL_ERROR_BYTES);
    const detail: Record<string, unknown> = {
        call: endpoint,
        status: response.status,
        contentType,
        body: parseErrorBody(text, contentType),
    };
    if (truncated) detail.truncated = true;
    return new FunctionExecutionError(message, 502, detail);
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

function callRequest(endpoint: SourceEndpoint, call: FunctionCall, vars: FunctionRuntimeVars): Request {
    const url = new URL("https://cms.function/internal");
    for (const [key, value] of Object.entries(resolveObject(call.params, vars))) {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const body = resolveFunctionValue(call.body, vars);
    return new Request(url, {
        method: endpoint.method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

function resolveObject(value: Record<string, FunctionValue> | undefined, vars: FunctionRuntimeVars): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, resolveFunctionValue(item, vars)]));
}
