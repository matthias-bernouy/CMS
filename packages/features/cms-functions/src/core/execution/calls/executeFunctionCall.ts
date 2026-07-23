import { executeEndpoint, makeEndpointUrn, systemSourceUrnOf } from "@bernouy/cms-sources";
import type { CmsFunction, FunctionCall } from "cms-functions/interfaces/FunctionDefinition";
import type { ExecuteFunctionOptions } from "cms-functions/core/execution/executeFunction";
import {
    FunctionExecutionError,
    RecoverableFunctionCallError,
    UnexpectedFunctionExecutionError,
    type FunctionExecutionErrorContext,
} from "cms-functions/core/model/errors";
import type { FunctionRuntimeVars } from "cms-functions/core/model/expressions";
import { MAX_FUNCTION_RESPONSE_BYTES } from "cms-functions/core/execution/context/limits";
import { resolveCallMappings } from "cms-functions/core/execution/context/identityResolution";
import { callFailureError, contextualizeFunctionError } from "cms-functions/core/execution/calls/callResponse";
import { readLimitedText } from "cms-functions/core/execution/calls/callBody";
import { buildFunctionCallRequest } from "cms-functions/core/execution/calls/callRequest";

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
        if (!endpoint) {
            throw new FunctionExecutionError(`Function call endpoint not found: ${call.source}.${call.endpoint}`);
        }
        if (systemSourceUrnOf(endpoint.urn)) {
            throw new FunctionExecutionError(`Function call cannot target system endpoint: ${endpoint.urn}`);
        }
        if (endpoint.responseKind && endpoint.responseKind !== "json") {
            throw new FunctionExecutionError(`Function call target is not JSON: ${endpoint.urn}`);
        }

        const mappings = await resolveCallMappings(definition, call, endpoint, vars, options);
        const response = await executeEndpoint(endpoint, buildFunctionCallRequest(endpoint, mappings), options.deps);
        if (!response.ok) {
            throw await callFailureError(call, endpoint, definition, response, options);
        }
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
        if (!text) {
            return null;
        }
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
