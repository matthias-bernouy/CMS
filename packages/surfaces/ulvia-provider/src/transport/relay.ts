import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseCapabilityOperationHandle } from "@bernouy/cms-repository/contracts/protocol";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { RequestBodyTooLargeError } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";
import {
    ProviderCapabilityDispatchError,
    ProviderCapabilityResponse,
    type ProviderBinaryResult,
    type ProviderCapabilityDispatcher,
    type ProviderCapabilityInvocationContext,
} from "../dispatch/registry";
import { encodeSessionEffect, SESSION_EFFECT_HEADER } from "@bernouy/cms-gateway/protocol";
import { providerInvocationContext } from "./context";
import { decodeProviderContractInput } from "./input";
import type { ProviderRoute } from "./routes";

export function createProviderContractRelay(
    routes: readonly ProviderRoute[],
    dispatcher: ProviderCapabilityDispatcher,
    scope: { readonly siteId: string; readonly providerId: string },
    logger: Logger,
): (request: Request, claims: ProviderInvocationClaims) => Promise<Response | null> {
    return async (request, claims) => {
        const url = new URL(request.url);
        const selected = routes
            .filter(
                (route) =>
                    route.contractId === claims.contractId &&
                    route.contractVersion === claims.contractVersion &&
                    route.capability.id === claims.capabilityId,
            )
            .map((route) => ({ route, parameters: route.match(request.method, url.pathname) }))
            .find(({ parameters }) => parameters !== null);
        if (!selected?.parameters) {
            return null;
        }
        const { contractId, capability } = selected.route;
        let input: Readonly<Record<string, unknown>>;
        let context: ProviderCapabilityInvocationContext;
        try {
            const decoded = await decodeProviderContractInput(request, url, capability, selected.parameters);
            input = decoded.input;
            validateProviderInput(capability, input, Boolean(decoded.binaryBody));
            context = {
                ...providerInvocationContext(request, claims, scope),
                ...(decoded.binaryBody ? { binaryBody: decoded.binaryBody } : {}),
            };
            validateIdempotencyContext(capability, context);
        } catch (cause) {
            logger.warn(
                "provider.capability.input_rejected",
                {
                    contractId,
                    capabilityId: capability.id,
                    status: cause instanceof RequestBodyTooLargeError ? 413 : 400,
                },
                cause,
            );
            return new Response(null, {
                status: cause instanceof RequestBodyTooLargeError ? 413 : 400,
                headers: { "Cache-Control": "no-store" },
            });
        }
        try {
            const dispatched = await dispatcher.invoke(contractId, capability.id, input, context);
            const output = dispatched instanceof ProviderCapabilityResponse ? dispatched.output : dispatched;
            const responseEffect =
                dispatched instanceof ProviderCapabilityResponse ? dispatched.responseEffect : undefined;
            if (capability.responseEffects?.length) {
                logger.debug("provider.capability.response_effect", {
                    contractId,
                    capabilityId: capability.id,
                    effect: responseEffect?.type ?? "none",
                });
            }
            if (responseEffect && !capability.responseEffects?.includes(responseEffect.type)) {
                throw new TypeError("Capability returned an undeclared response effect.");
            }
            if (capability.output.type === "binary") {
                if (responseEffect) {
                    throw new TypeError("Binary capabilities cannot return response effects.");
                }
                return binaryResponse(request.method, capability, output);
            }
            if (capability.behavior.execution === "operation") {
                parseCapabilityOperationHandle(output);
            } else {
                validateSchemaValue(capability.output, output);
            }
            return successResponse(request.method, capability, output, responseEffect);
        } catch (cause) {
            if (cause instanceof ProviderCapabilityDispatchError) {
                const status = capability.binding.response.errorStatuses[cause.code];
                if (status === cause.status) {
                    logger.warn("provider.capability.rejected", {
                        contractId,
                        capabilityId: capability.id,
                        errorCode: cause.code,
                        status,
                    });
                    if (request.method === "HEAD") {
                        return headError(status, cause.code, context.requestId, cause.responseHeaders);
                    }
                    return Response.json(
                        { error: { code: cause.code } },
                        {
                            status,
                            headers: { ...safeBinaryHeaders(cause.responseHeaders), "Cache-Control": "no-store" },
                        },
                    );
                }
            }
            logger.error("provider.capability.failed", { contractId, capabilityId: capability.id, status: 503 }, cause);
            if (request.method === "HEAD") {
                return headError(503, "CORE_UNAVAILABLE", context.requestId);
            }
            return Response.json({ error: { code: "CORE_UNAVAILABLE" } }, { status: 503 });
        }
    };
}

function headError(
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

function validateProviderInput(
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

function binaryResponse(method: string, capability: CapabilityDefinition, output: unknown): Response {
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
            "content-type": output.contentType,
            ...(output.contentLength === undefined ? {} : { "content-length": String(output.contentLength) }),
        },
    });
}

function safeBinaryHeaders(headers: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> {
    const allowed = new Set([
        "accept-ranges",
        "cache-control",
        "content-disposition",
        "content-range",
        "etag",
        "last-modified",
    ]);
    const projected: Record<string, string> = {};
    for (const [rawName, value] of Object.entries(headers ?? {})) {
        const name = rawName.toLowerCase();
        if (!allowed.has(name) || value.length > 1024 || /[\x00-\x1f\x7f]/u.test(value)) {
            throw new TypeError("Binary capability returned an unsafe response header.");
        }
        projected[name] = value;
    }
    return projected;
}

function isBinaryResult(value: unknown): value is ProviderBinaryResult {
    return (
        !!value &&
        typeof value === "object" &&
        (value as ProviderBinaryResult).kind === "binary" &&
        (value as ProviderBinaryResult).stream instanceof ReadableStream &&
        typeof (value as ProviderBinaryResult).contentType === "string"
    );
}

function validateIdempotencyContext(
    capability: CapabilityDefinition,
    context: ProviderCapabilityInvocationContext,
): void {
    const keyed = capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed";
    if (Boolean(context.idempotencyKey) !== keyed) {
        throw new TypeError(keyed ? "Missing idempotency key." : "Unexpected idempotency key.");
    }
}

function successResponse(
    method: string,
    capability: CapabilityDefinition,
    output: unknown,
    responseEffect?: import("@bernouy/cms-gateway/protocol").GatewayResponseEffect,
): Response {
    const status = capability.binding.response.successStatuses[0]!;
    const headers = {
        "Cache-Control": "no-store",
        ...(responseEffect ? { [SESSION_EFFECT_HEADER]: encodeSessionEffect(responseEffect) } : {}),
    };
    if (method === "HEAD" || status === 204 || status === 205) {
        return new Response(null, { status, headers });
    }
    return Response.json(output, { status, headers });
}
