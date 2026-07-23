import { projectStrictDataShape, type SourceEndpoint } from "@bernouy/cms-sources";
import type { ExecuteFunctionOptions } from "cms-functions/core/execution/executeFunction";
import { readLimitedText } from "cms-functions/core/execution/calls/callBody";
import { MAX_FUNCTION_CALL_ERROR_BYTES } from "cms-functions/core/execution/context/limits";
import type { CmsFunction, FunctionCall } from "cms-functions/interfaces/FunctionDefinition";
import {
    PROPAGATABLE_FUNCTION_CALL_STATUSES,
    PropagatedFunctionCallError,
    RecoverableFunctionCallError,
    type FunctionExecutionErrorContext,
} from "cms-functions/core/model/errors";

export async function propagatedCallFailureError(
    call: FunctionCall,
    endpoint: SourceEndpoint,
    definition: CmsFunction,
    response: Response,
    options: ExecuteFunctionOptions,
    context: FunctionExecutionErrorContext,
): Promise<RecoverableFunctionCallError | null> {
    const status = mappedFunctionStatus(call, endpoint, definition, response.status);
    if (status === null) {
        return null;
    }
    const message = `Function call "${call.endpoint}" failed with status ${response.status}`;
    const body = await readDeclaredErrorBody(response, endpoint, options);
    if (!body.ok) {
        return new RecoverableFunctionCallError(
            message,
            502,
            undefined,
            response.headers.get("x-correlation-id") ?? undefined,
            context,
        );
    }
    return new PropagatedFunctionCallError(message, status, body.value, context);
}

function mappedFunctionStatus(
    call: FunctionCall,
    endpoint: SourceEndpoint,
    definition: CmsFunction,
    sourceStatus: number,
): number | null {
    const mappings = call.onError?.propagate;
    if (!Array.isArray(mappings) || !isPropagatableStatus(sourceStatus)) {
        return null;
    }
    const mapping = mappings.find((candidate) => candidate?.sourceStatus === sourceStatus);
    if (
        !mapping ||
        !isPropagatableStatus(mapping.status) ||
        !endpoint.output?.some((output) => output.status === String(sourceStatus)) ||
        !definition.output?.some((output) => output.status === String(mapping.status))
    ) {
        return null;
    }
    return mapping.status;
}

async function readDeclaredErrorBody(
    response: Response,
    endpoint: SourceEndpoint,
    options: ExecuteFunctionOptions,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
    const contract = endpoint.output?.find((output) => output.status === String(response.status));
    if (!contract?.body) {
        if (response.body) {
            await response.body.cancel().catch(() => undefined);
        }
        return { ok: true, value: undefined };
    }
    if (!isJsonMediaType(response.headers.get("content-type") ?? "")) {
        if (response.body) {
            await response.body.cancel().catch(() => undefined);
        }
        return { ok: false };
    }
    const { text, truncated } = await readLimitedText(
        response,
        options.maxCallErrorBytes ?? MAX_FUNCTION_CALL_ERROR_BYTES,
    );
    if (truncated || !text) {
        return { ok: false };
    }
    try {
        return {
            ok: true,
            value: projectStrictDataShape(JSON.parse(text) as unknown, contract.body, "response"),
        };
    } catch {
        return { ok: false };
    }
}

function isPropagatableStatus(value: unknown): value is (typeof PROPAGATABLE_FUNCTION_CALL_STATUSES)[number] {
    return (
        Number.isInteger(value) &&
        PROPAGATABLE_FUNCTION_CALL_STATUSES.includes(value as (typeof PROPAGATABLE_FUNCTION_CALL_STATUSES)[number])
    );
}

function isJsonMediaType(contentType: string): boolean {
    const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    return mediaType === "application/json" || /^[^\s/;]+\/[^\s/;]+\+json$/.test(mediaType);
}
