import { projectSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseContentRange } from "@bernouy/http-runner";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import type { CompiledHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import { parseCapabilityOperationHandle } from "@bernouy/cms-repository/contracts/protocol";
import type { GatewayResult, GatewayTransportResponse } from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

export function validateResponse(
    capability: CapabilityDefinition,
    binding: CompiledHttpBinding,
    response: GatewayTransportResponse,
    requestId: string,
): GatewayResult {
    if (!Number.isInteger(response.status)) {
        throw new GatewayError("invalid_provider_response", "provider response status is invalid");
    }
    if (binding.response.successStatuses.includes(response.status)) {
        if (response.errorCode !== undefined) {
            throw new GatewayError("invalid_provider_response", "success response contains an error code");
        }
        checkContentType(capability, binding, response);
        if (binding.response.kind === "operation-handle") {
            if (response.bytes !== undefined) {
                throw new GatewayError("invalid_provider_response", "operation handle contains binary bytes");
            }
            try {
                return Object.freeze({
                    kind: "success",
                    requestId,
                    status: response.status,
                    output: parseCapabilityOperationHandle(response.output),
                });
            } catch {
                throw new GatewayError("invalid_provider_response", "provider operation handle is invalid");
            }
        }
        if (capability.output.type === "binary") {
            const stream = response.stream ?? (response.bytes ? byteStream(response.bytes) : undefined);
            if (
                !stream ||
                response.output !== undefined ||
                (response.bytes && response.bytes.byteLength > capability.output.maxBytes) ||
                (response.contentLength !== undefined && response.contentLength > capability.output.maxBytes)
            ) {
                throw new GatewayError(
                    "invalid_provider_response",
                    "provider binary output violates the selected release",
                );
            }
            checkBinaryRange(response);
            return Object.freeze({
                kind: "binary",
                requestId,
                status: response.status,
                stream,
                contentType: response.contentType!.split(";", 1)[0]!.trim().toLowerCase(),
                ...(response.contentLength === undefined ? {} : { contentLength: response.contentLength }),
                responseHeaders: projectedHeaders(response, [
                    "etag",
                    "content-disposition",
                    "content-range",
                    "accept-ranges",
                    "cache-control",
                    "last-modified",
                ]),
            });
        }
        if (response.bytes !== undefined) {
            throw new GatewayError("invalid_provider_response", "provider JSON output contains binary bytes");
        }
        try {
            const output = projectSchemaValue(capability.output, response.output ?? null);
            return Object.freeze({ kind: "success", requestId, status: response.status, output });
        } catch {
            throw new GatewayError(
                "invalid_provider_response",
                "provider success output violates the selected release",
            );
        }
    }
    const definition = capability.errors.find((error) => error.code === response.errorCode);
    if (!definition || binding.response.errorStatuses[definition.code] !== response.status) {
        throw new GatewayError("invalid_provider_response", "provider error is undeclared or has the wrong status");
    }
    const actualContentType = response.contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (
        (binding.response.errorEnvelope.kind === "json" && actualContentType !== "application/json") ||
        (binding.response.errorEnvelope.kind === "headers" && response.contentType !== undefined)
    ) {
        throw new GatewayError("invalid_provider_response", "provider error content type is invalid");
    }
    try {
        const errorHeaders = projectedHeaders(response, ["retry-after", "content-range"]);
        if (
            response.status === 416 &&
            errorHeaders["content-range"] !== undefined &&
            !/^bytes \*\/\d+$/u.test(errorHeaders["content-range"])
        ) {
            throw new GatewayError("invalid_provider_response", "provider unsatisfied range is invalid");
        }
        const output = definition.output
            ? projectSchemaValue(definition.output, response.output)
            : response.output === undefined || response.output === null
              ? undefined
              : invalidErrorOutput();
        return Object.freeze({
            kind: "declared-error",
            requestId,
            status: response.status,
            errorCode: definition.code,
            output,
            responseHeaders: errorHeaders,
        });
    } catch {
        throw new GatewayError("invalid_provider_response", "provider error output violates the selected release");
    }
}

function checkBinaryRange(response: GatewayTransportResponse): void {
    const range = response.responseHeaders?.["content-range"];
    if (response.status !== 206) {
        if (range !== undefined) {
            throw new GatewayError("invalid_provider_response", "unexpected provider content range");
        }
        return;
    }
    const parsed = parseContentRange(range ?? null);
    const length = response.contentLength ?? response.bytes?.byteLength;
    if (!parsed || (length !== undefined && parsed.end - parsed.start + 1 !== length)) {
        throw new GatewayError("invalid_provider_response", "provider content range does not match the bytes");
    }
}

function projectedHeaders(
    response: GatewayTransportResponse,
    names: readonly string[],
): Readonly<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const name of names) {
        const value = response.responseHeaders?.[name];
        if (value === undefined) {
            continue;
        }
        if (typeof value !== "string" || value.length > 1024 || /[\x00-\x1f\x7f]/.test(value)) {
            throw new GatewayError("invalid_provider_response", "provider response header is invalid");
        }
        result[name] = value;
    }
    return Object.freeze(result);
}

function checkContentType(
    capability: CapabilityDefinition,
    binding: CompiledHttpBinding,
    response: GatewayTransportResponse,
): void {
    const allowed = binding.response.contentTypes;
    const actual = response.contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (capability.output.type === "binary" && binding.response.kind !== "operation-handle") {
        if (!actual || !/^[!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+$/.test(actual)) {
            throw new GatewayError("invalid_provider_response", "provider binary content type is invalid");
        }
        if (allowed.length > 0 && !allowed.includes(actual)) {
            throw new GatewayError("invalid_provider_response", "provider returned an undeclared content type");
        }
        return;
    }
    if (allowed.length === 0) {
        if (response.contentType !== undefined) {
            throw new GatewayError("invalid_provider_response", "unexpected response content type");
        }
        return;
    }
    if (!actual || !allowed.includes(actual)) {
        throw new GatewayError("invalid_provider_response", "provider returned an undeclared content type");
    }
}

function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
    const copy = new Uint8Array(bytes);
    return new ReadableStream({
        start(controller) {
            controller.enqueue(copy);
            controller.close();
        },
    });
}

function invalidErrorOutput(): never {
    throw new GatewayError("invalid_provider_response", "undeclared error output");
}
