import { projectSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import type { CompiledHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
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
        checkContentType(binding, response);
        if (capability.output.type === "binary") {
            if (
                !(response.bytes instanceof Uint8Array) ||
                response.bytes.byteLength > capability.output.maxBytes ||
                response.output !== undefined
            ) {
                throw new GatewayError(
                    "invalid_provider_response",
                    "provider binary output violates the selected release",
                );
            }
            return Object.freeze({
                kind: "binary",
                requestId,
                status: response.status,
                bytes: new Uint8Array(response.bytes),
                contentType: response.contentType!.split(";", 1)[0]!.trim().toLowerCase(),
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
        });
    } catch {
        throw new GatewayError("invalid_provider_response", "provider error output violates the selected release");
    }
}

function checkContentType(binding: CompiledHttpBinding, response: GatewayTransportResponse): void {
    const allowed = binding.response.contentTypes;
    if (allowed.length === 0) {
        if (response.contentType !== undefined) {
            throw new GatewayError("invalid_provider_response", "unexpected response content type");
        }
        return;
    }
    const actual = response.contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (!actual || !allowed.includes(actual)) {
        throw new GatewayError("invalid_provider_response", "provider returned an undeclared content type");
    }
}

function invalidErrorOutput(): never {
    throw new GatewayError("invalid_provider_response", "undeclared error output");
}
