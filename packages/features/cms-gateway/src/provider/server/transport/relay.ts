import { runWithTraceContext } from "@bernouy/logging/tracing";
import { projectSchemaValue, validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseCapabilityOperationHandle } from "@bernouy/cms-repository/contracts/protocol";
import type { ProviderInvocationClaims } from "cms-gateway/exports/protocol";
import { inputFailureResponse } from "cms-gateway/protocol/http/inputFailure";
import { RequestBodyTooLargeError } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";
import {
    ProviderCapabilityDispatchError,
    ProviderCapabilityResponse,
    ProviderResourceResponse,
    type ProviderCapabilityDispatcher,
    type ProviderCapabilityInvocationContext,
} from "../dispatch/registry";
import { providerInvocationContext } from "./context";
import { decodeProviderContractInput } from "./input";
import type { ProviderRoute } from "./routes";

export function createProviderContractRelay(
    routes: readonly ProviderRoute[],
    dispatcher: ProviderCapabilityDispatcher,
    scope: { readonly siteId: string; readonly providerId: string },
    logger: Logger,
    authorize: (claims: ProviderInvocationClaims, controlAuthority?: boolean) => Promise<boolean> = async () => true,
    transformResponse?: (
        request: Request,
        response: Response,
        claims: ProviderInvocationClaims,
        controlAuthority: boolean,
    ) => Promise<Response>,
): (request: Request, claims: ProviderInvocationClaims, controlAuthority?: boolean) => Promise<Response | null> {
    const relay = async (
        request: Request,
        claims: ProviderInvocationClaims,
        controlAuthority = false,
    ): Promise<Response | null> => {
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
            logger.warn(
                "provider.capability.input_rejected",
                {
                    contractId,
                    capabilityId: capability.id,
                    status: cause instanceof RequestBodyTooLargeError ? 413 : 400,
                },
                cause,
            );
            return inputFailureResponse(
                request,
                cause instanceof RequestBodyTooLargeError ? 413 : 400,
                cause,
                claims.requestId,
                true,
            );
        }
        try {
            if (!(await authorize(claims, controlAuthority))) {
                return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
            }
            const dispatchStartedAt = performance.now();
            const dispatched = await dispatcher.invoke(
                selected.route.dispatchContractId ?? contractId,
                capability.id,
                input,
                context,
            );
            reportDispatch(logger, contractId, capability.id, performance.now() - dispatchStartedAt, claims.requestId);
            const resource = dispatched instanceof ProviderResourceResponse ? dispatched : undefined;
            const rawOutput =
                resource?.response ??
                (dispatched instanceof ProviderCapabilityResponse ? dispatched.output : dispatched);
            const adapted =
                rawOutput instanceof Response
                    ? await adaptProviderResponse(
                          rawOutput,
                          capability,
                          context.requestContext?.resource?.method ?? request.method,
                          resource?.metadata,
                          context.signal,
                          isRevalidationRequest(request.method, context.http!.headers),
                      )
                    : undefined;
            if (adapted?.notModified) {
                return new Response(null, { status: 304, headers: adapted.headers });
            }
            const output = adapted ? adapted.output : rawOutput;
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
                const response = binaryResponse(request.method, capability, output);
                logger.debug("provider.capability.binary_response", {
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
            const response = successResponse(request.method, capability, output, responseEffect, adapted?.status);
            for (const [name, value] of Object.entries(adapted?.headers ?? {})) {
                response.headers.set(name, value);
            }
            return transformResponse ? await transformResponse(request, response, claims, controlAuthority) : response;
        } catch (cause) {
            if (cause instanceof ProviderCapabilityDispatchError) {
                const status = capability.binding.response.errorStatuses[cause.code];
                const definition = capability.errors.find((error) => error.code === cause.code);
                let valid = Boolean(definition);
                let errorOutput: unknown;
                try {
                    if (definition?.output) {
                        errorOutput = projectSchemaValue(definition.output, cause.output);
                    }
                } catch {
                    valid = false;
                }
                if (status === cause.status && valid) {
                    logger.warn("provider.capability.rejected", {
                        contractId,
                        capabilityId: capability.id,
                        errorCode: cause.code,
                        invocationId: context.requestId,
                        ...(cause.reason ? { reason: cause.reason } : {}),
                        status,
                    });
                    if (request.method === "HEAD") {
                        return headError(status, cause.code, context.requestId, cause.responseHeaders);
                    }
                    return Response.json(
                        {
                            error: {
                                code: cause.code,
                                ...(errorOutput === undefined ? {} : { output: errorOutput }),
                            },
                        },
                        {
                            status,
                            headers: { ...validateResponseHeaders(cause.responseHeaders), "Cache-Control": "no-store" },
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

import { adaptProviderResponse } from "./response";
import {
    headError,
    validateProviderInput,
    binaryResponse,
    validateIdempotencyContext,
    successResponse,
} from "./outcomes";
import { validateResponseHeaders } from "./response";
import { isRevalidationRequest } from "cms-gateway/protocol/http/conditional";
