import { routeResponse } from "./routeResponse";
import { runWithTraceContext } from "@bernouy/logging/tracing";
import { RESOURCE_HEADER, parseResourceMetadata } from "@bernouy/cms-gateway/protocol";
import type { GatewayResponseEffect } from "@bernouy/cms-gateway/protocol";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseCapabilityOperationHandle } from "@bernouy/cms-repository/contracts/protocol";
import type { HttpBoundCapability as CapabilityDefinition } from "./routes";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { RequestBodyTooLargeError } from "@bernouy/http-runner";
import { NOOP_LOGGER, type Logger } from "@bernouy/logging";
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
    authorize: (claims: ProviderInvocationClaims, controlAuthority?: boolean) => Promise<boolean> = async () => true,
): (request: Request, claims: ProviderInvocationClaims, controlAuthority?: boolean) => Promise<Response | null> {
    const relay = async (
        request: Request,
        claims: ProviderInvocationClaims,
        controlAuthority = false,
    ): Promise<Response | null> => {
        const invocationLogger = claims.contractId === "ulvia.cms.observability" ? NOOP_LOGGER : logger;
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
                ...providerInvocationContext(request, claims, scope, controlAuthority),
                ...(decoded.binaryBody ? { binaryBody: decoded.binaryBody } : {}),
            };
            validateIdempotencyContext(capability, context);
        } catch (cause) {
            invocationLogger.warn(
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
            if (!(await authorize(claims, controlAuthority))) {
                return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
            }
            const dispatchStartedAt = performance.now();
            const dispatched = await dispatcher.invoke(contractId, capability.id, input, context);
            reportDispatch(
                invocationLogger,
                contractId,
                capability.id,
                performance.now() - dispatchStartedAt,
                claims.requestId,
            );
            const output = dispatched instanceof ProviderCapabilityResponse ? dispatched.output : dispatched;
            const responseEffect =
                dispatched instanceof ProviderCapabilityResponse ? dispatched.responseEffect : undefined;
            if (capability.responseEffects?.length) {
                invocationLogger.debug("provider.capability.response_effect", {
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
                const response = binaryResponse(request.method, capability, output);
                invocationLogger.debug("provider.capability.binary_response", {
                    contractId,
                    capabilityId: capability.id,
                    status: response.status,
                    rangeRequested: request.headers.has("range"),
                    ifRangeSupplied: request.headers.has("if-range"),
                });
                return response;
            }
            if (capability.behavior.execution === "operation") {
                parseCapabilityOperationHandle(output);
            } else {
                validateSchemaValue(capability.output, output);
            }
            const response = successResponse(request.method, capability, output, responseEffect);
            return controlAuthority && contractId === "ulvia.cms.installations" && capability.id === "gateway.route.get"
                ? routeResponse(request, response)
                : response;
        } catch (cause) {
            if (cause instanceof ProviderCapabilityDispatchError) {
                const status = capability.binding.response.errorStatuses[cause.code];
                if (status === cause.status) {
                    invocationLogger.warn("provider.capability.rejected", {
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
            invocationLogger.error(
                "provider.capability.failed",
                { contractId, capabilityId: capability.id, status: 503 },
                cause,
            );
            if (request.method === "HEAD") {
                return headError(503, "CORE_UNAVAILABLE", context.requestId);
            }
            return Response.json({ error: { code: "CORE_UNAVAILABLE" } }, { status: 503 });
        }
    };
    return (request, claims, controlAuthority) =>
        claims.trace
            ? runWithTraceContext(claims.trace, () => relay(request, claims, controlAuthority))
            : relay(request, claims, controlAuthority);
}

function reportDispatch(
    logger: Logger,
    contractId: string,
    capabilityId: string,
    durationMs: number,
    invocationId: string,
): void {
    const attributes = { contractId, capabilityId, invocationId, durationMs: Math.round(durationMs * 100) / 100 };
    if (durationMs >= 50) {
        logger.info("provider.capability.completed", attributes);
        return;
    }
    logger.debug("provider.capability.completed", attributes);
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
            ...(capability.output.type === "binary" && capability.output.resource
                ? { [RESOURCE_HEADER]: JSON.stringify(parseResourceMetadata(output.resource)) }
                : {}),
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
    responseEffect?: GatewayResponseEffect,
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
