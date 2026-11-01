import {
    RESOURCE_HEADER,
    parseResourceMetadata,
    encodeSessionEffect,
    SESSION_EFFECT_HEADER,
} from "cms-gateway/exports/protocol";
import type { GatewayResponseEffect } from "cms-gateway/exports/protocol";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { HttpBoundCapability as CapabilityDefinition } from "./routes";
import type { ProviderBinaryResult, ProviderCapabilityInvocationContext } from "../dispatch/registry";
import { validateResponseHeaders } from "./response";
export function headError(
    status: number,
    code: string,
    requestId: string,
    responseHeaders: Readonly<Record<string, string>> = {},
): Response {
    return new Response(null, {
        status,
        headers: {
            ...safeBinaryHeaders(responseHeaders),
            "Cache-Control": "no-store",
            "x-ulvia-error-code": encodeURIComponent(code),
            "x-ulvia-request-id": encodeURIComponent(requestId),
        },
    });
}

export function validateProviderInput(
    capability: CapabilityDefinition,
    input: Readonly<Record<string, unknown>>,
    hasBinaryBody: boolean,
): void {
    const binaryProperty =
        typeof capability.binding.input?.body === "object" && "binaryProperty" in capability.binding.input.body
            ? capability.binding.input.body.binaryProperty
            : undefined;
    if (Boolean(binaryProperty) !== hasBinaryBody) {
        throw new TypeError("Binary body does not match the admitted binding.");
    }
    if (!binaryProperty) {
        validateSchemaValue(capability.input, input);
        return;
    }
    const properties = Object.fromEntries(
        Object.entries(capability.input.properties).filter(([name]) => name !== binaryProperty),
    );
    validateSchemaValue(
        {
            ...capability.input,
            properties,
            required: capability.input.required.filter((name) => name !== binaryProperty),
        },
        input,
    );
}

export function binaryResponse(method: string, capability: CapabilityDefinition, output: unknown): Response {
    if (!isBinaryResult(output)) {
        throw new TypeError("Binary capability returned a non-binary result.");
    }
    const status = output.status ?? capability.binding.response.successStatuses[0]!;
    if (!capability.binding.response.successStatuses.includes(status)) {
        throw new TypeError("Binary capability returned an undeclared status.");
    }
    if (method === "HEAD") {
        void output.stream.cancel();
    }
    return new Response(method === "HEAD" ? null : output.stream, {
        status,
        headers: {
            ...safeBinaryHeaders(output.headers),
            ...(capability.output.type === "binary" && capability.output.resource
                ? { [RESOURCE_HEADER]: JSON.stringify(parseResourceMetadata(output.resource)) }
                : {}),
            "content-type": output.contentType,
            ...(output.contentLength === undefined ? {} : { "content-length": String(output.contentLength) }),
        },
    });
}

const safeBinaryHeaders = validateResponseHeaders;

function isBinaryResult(value: unknown): value is ProviderBinaryResult {
    return (
        !!value &&
        typeof value === "object" &&
        (value as ProviderBinaryResult).kind === "binary" &&
        (value as ProviderBinaryResult).stream instanceof ReadableStream &&
        typeof (value as ProviderBinaryResult).contentType === "string"
    );
}

export function validateIdempotencyContext(
    capability: CapabilityDefinition,
    context: ProviderCapabilityInvocationContext,
): void {
    const keyed = capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed";
    if (Boolean(context.idempotencyKey) !== keyed) {
        throw new TypeError(keyed ? "Missing idempotency key." : "Unexpected idempotency key.");
    }
}

export function successResponse(
    method: string,
    capability: CapabilityDefinition,
    output: unknown,
    responseEffect?: GatewayResponseEffect,
    status = capability.binding.response.successStatuses[0]!,
): Response {
    const headers = {
        "Cache-Control": "no-store",
        ...(responseEffect ? { [SESSION_EFFECT_HEADER]: encodeSessionEffect(responseEffect) } : {}),
    };
    if (method === "HEAD" || status === 204 || status === 205) {
        return new Response(null, { status, headers });
    }
    return Response.json(output, { status, headers });
}
