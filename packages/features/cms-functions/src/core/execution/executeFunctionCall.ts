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
import { MAX_FUNCTION_RESPONSE_BYTES } from "./limits";

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
    if (!response.ok) throw new FunctionExecutionError(`Function call "${call.endpoint}" failed with status ${response.status}`, 502);

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
