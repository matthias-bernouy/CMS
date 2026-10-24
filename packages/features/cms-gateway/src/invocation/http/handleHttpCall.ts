import { decodeHttpFieldParameter, decodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import type { CompiledHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type {
    GatewayActor,
    GatewayHttpRoute,
    GatewayInvocation,
    GatewayInvoker,
    GatewayResult,
} from "cms-gateway/invocation/interfaces/Invocation";
import { readGatewayHttpInput } from "cms-gateway/invocation/http/readHttpInput";
import { encodeSessionEffect, SESSION_EFFECT_HEADER } from "cms-gateway/protocol/TrustedCapabilityEffects";

export interface GatewayHttpCallOptions {
    readonly invoker: GatewayInvoker;
    readonly siteId: string;
    readonly actor: GatewayActor;
    readonly prefix: string;
    readonly onFailure?: GatewayHttpFailureObserver;
    readonly actorCredential?: GatewayInvocation["actorCredential"];
}

export type GatewayHttpFailure = Readonly<{
    code: string;
    status: number;
    phase: "authorization" | "invocation";
}>;

export type GatewayHttpFailureObserver = (failure: GatewayHttpFailure, error: unknown) => void;

/** Resolves the admitted HTTP binding and invokes it through the normal authorization path. */
export async function handleGatewayHttpCall(request: Request, options: GatewayHttpCallOptions): Promise<Response> {
    try {
        const target = parseTarget(request, options.prefix);
        const route = await options.invoker.resolveHttp({
            siteId: options.siteId,
            contractId: target.contractId,
            method: request.method,
            path: target.bindingPath,
        });
        const { input, binaryBody } = await readBindingInput(request, route);
        const idempotencyKey = requestIdempotencyKey(request, route);
        const result = await options.invoker.invoke({
            siteId: options.siteId,
            contractId: target.contractId,
            capabilityId: route.capability.id,
            actor: options.actor,
            ...(request.method === "HEAD" ? { httpMethod: "HEAD" as const } : {}),
            ...(idempotencyKey ? { idempotencyKey } : {}),
            ...(binaryBody ? { binaryBody } : {}),
            ...(options.actorCredential ? { actorCredential: options.actorCredential } : {}),
            input,
        });
        return gatewayResultResponse(result, request.method);
    } catch (error) {
        const head = request.method === "HEAD";
        const code = error instanceof GatewayError ? error.code : "internal_error";
        const status = error instanceof GatewayError ? errorStatus(error, options.actor) : 500;
        observeFailure(options.onFailure, { code, status, phase: "invocation" }, error);
        if (head) {
            return headFailure(code, status, error instanceof GatewayError ? error.requestId : undefined);
        }
        return gatewayFailureResponse(code, status, error instanceof GatewayError ? error.requestId : undefined);
    }
}

export function observeFailure(
    observer: GatewayHttpFailureObserver | undefined,
    failure: GatewayHttpFailure,
    error: unknown,
): void {
    try {
        observer?.(failure, error);
    } catch {
        // Observability must never alter the capability response.
    }
}

function requestIdempotencyKey(request: Request, route: GatewayHttpRoute): string | undefined {
    const explicit = parseIdempotencyKey(request.headers.get("idempotency-key"));
    if (explicit) {
        return explicit;
    }
    const behavior = route.capability.behavior;
    if (behavior.effect !== "command" || behavior.idempotency !== "keyed") {
        return undefined;
    }
    return parseIdempotencyKey(request.headers.get("x-ulvia-automatic-idempotency-key"));
}

function headFailure(code: string, status: number, requestId?: string): Response {
    return new Response(null, {
        status,
        headers: {
            "cache-control": "private, no-store",
            "x-ulvia-error-code": encodeURIComponent(code),
            ...(requestId ? { "x-ulvia-request-id": requestId } : {}),
        },
    });
}

function parseTarget(request: Request, prefix: string): { contractId: string; bindingPath: string } {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(`${prefix}/`)) {
        throw new GatewayError("invalid_route", "request is outside the gateway route");
    }
    const suffix = pathname.slice(prefix.length + 1);
    const separator = suffix.indexOf("/");
    const encodedContractId = separator < 0 ? suffix : suffix.slice(0, separator);
    const bindingPath = separator < 0 ? "/" : suffix.slice(separator);
    let contractId: string;
    try {
        contractId = decodeURIComponent(encodedContractId);
    } catch {
        throw new GatewayError("invalid_input", "contract identifier is malformed");
    }
    if (
        contractId.length > 128 ||
        !/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/.test(contractId) ||
        !bindingPath.startsWith("/")
    ) {
        throw new GatewayError("invalid_input", "contract route is invalid");
    }
    return { contractId, bindingPath };
}

async function readBindingInput(
    request: Request,
    route: GatewayHttpRoute,
): Promise<{
    input: Readonly<Record<string, unknown>>;
    binaryBody?: { stream: ReadableStream<Uint8Array>; contentType?: string; contentLength?: number };
}> {
    const input: Record<string, unknown> = {};
    for (const parameter of route.binding.pathParameters) {
        input[parameter.property] = decodeParameter(route, parameter, route.pathValues[parameter.wireName]);
    }
    const query = rawQueryParameters(new URL(request.url).search);
    for (const parameter of route.binding.query) {
        const values = query.get(parameter.wireName) ?? [];
        if (values.length > 1) {
            throw new GatewayError("invalid_input", "query parameter must not be repeated");
        }
        const value = decodeParameter(route, parameter, values[0]);
        if (value !== undefined) {
            input[parameter.property] = value;
        }
    }
    for (const parameter of route.binding.headers) {
        const value = decodeParameter(route, parameter, request.headers.get(parameter.wireName) ?? undefined);
        if (value !== undefined) {
            input[parameter.property] = value;
        }
    }
    if (route.binding.body?.kind === "json") {
        const bodyBinding = route.binding.body;
        const body = await readGatewayHttpInput(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new GatewayError("invalid_input", "JSON binding body must be an object");
        }
        const record = body as Record<string, unknown>;
        for (const name of bodyBinding.properties) {
            if (Object.hasOwn(record, name)) {
                input[name] = record[name];
            }
        }
        if (Object.keys(record).some((name) => !bodyBinding.properties.includes(name))) {
            throw new GatewayError("invalid_input", "JSON binding body contains an undeclared property");
        }
    }
    if (route.binding.body?.kind !== "binary") {
        return { input };
    }
    if (!request.body) {
        throw new GatewayError("invalid_input", "binary request body is required");
    }
    const lengthHeader = request.headers.get("content-length");
    const contentLength = lengthHeader === null ? undefined : Number(lengthHeader);
    if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0)) {
        throw new GatewayError("invalid_input", "content length is invalid");
    }
    const contentType = request.headers.get("content-type") ?? undefined;
    return {
        input,
        binaryBody: {
            stream: request.body,
            ...(contentType ? { contentType } : {}),
            ...(contentLength === undefined ? {} : { contentLength }),
        },
    };
}

function decodeParameter(
    route: GatewayHttpRoute,
    parameter: CompiledHttpParameter,
    encoded: string | undefined,
): unknown {
    try {
        const schema = route.capability.input.properties[parameter.property] as never;
        return parameter.encoding === "http-field"
            ? decodeHttpFieldParameter(schema, encoded)
            : decodeHttpParameter(schema, encoded);
    } catch {
        throw new GatewayError("invalid_input", `HTTP parameter ${parameter.property} is invalid`);
    }
}

function rawQueryParameters(search: string): ReadonlyMap<string, readonly string[]> {
    const result = new Map<string, string[]>();
    for (const field of search.slice(1).split("&")) {
        if (!field) {
            continue;
        }
        const separator = field.indexOf("=");
        const rawName = separator < 0 ? field : field.slice(0, separator);
        const rawValue = separator < 0 ? "" : field.slice(separator + 1);
        let name: string;
        try {
            name = decodeURIComponent(rawName.replace(/\+/g, "%20"));
        } catch {
            throw new GatewayError("invalid_input", "query parameter name is malformed");
        }
        const values = result.get(name) ?? [];
        values.push(rawValue);
        result.set(name, values);
    }
    return result;
}

function parseIdempotencyKey(value: string | null): string | undefined {
    if (value === null) {
        return undefined;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
        throw new GatewayError("invalid_input", "idempotency key is invalid");
    }
    return value;
}

export function gatewayResultResponse(result: GatewayResult, method: string): Response {
    const effectHeader: Record<string, string> = result.responseEffect
        ? { [SESSION_EFFECT_HEADER]: encodeSessionEffect(result.responseEffect) }
        : {};
    if (result.kind === "binary") {
        if (method === "HEAD") {
            void result.stream.cancel();
        }
        return new Response(method === "HEAD" ? null : result.stream, {
            status: result.status,
            headers: {
                "content-type": result.contentType,
                "x-content-type-options": "nosniff",
                "x-ulvia-request-id": result.requestId,
                ...(result.contentLength === undefined ? {} : { "content-length": String(result.contentLength) }),
                ...result.responseHeaders,
                ...effectHeader,
            },
        });
    }
    if (method === "HEAD" && result.kind === "declared-error") {
        return new Response(null, {
            status: result.status,
            headers: {
                "cache-control": "private, no-store",
                "x-ulvia-error-code": encodeURIComponent(result.errorCode),
                "x-ulvia-request-id": result.requestId,
                ...result.responseHeaders,
                ...effectHeader,
            },
        });
    }
    if (result.status === 204 || result.status === 205) {
        return new Response(null, {
            status: result.status,
            headers: {
                "cache-control": "private, no-store",
                "x-ulvia-request-id": result.requestId,
                ...effectHeader,
            },
        });
    }
    return result.kind === "success"
        ? jsonResponse(result.output ?? null, result.status, result.requestId, effectHeader)
        : jsonResponse(
              {
                  error: {
                      code: result.errorCode,
                      retryable: result.retryable,
                      ...(result.output === undefined ? {} : { output: result.output }),
                  },
              },
              result.status,
              result.requestId,
              result.responseHeaders,
          );
}

export function gatewayFailureResponse(code: string, status: number, requestId?: string): Response {
    return jsonResponse({ failure: { code, retryable: retryableGatewayFailure(code) } }, status, requestId);
}

function retryableGatewayFailure(code: string): boolean {
    return [
        "installation_unavailable",
        "internal_error",
        "media_busy",
        "media_unavailable",
        "not_ready",
        "stale_route",
        "transport_failure",
    ].includes(code);
}

function errorStatus(error: GatewayError, actor: GatewayActor): number {
    switch (error.code) {
        case "invalid_input":
            return 400;
        case "outcome_unknown":
            return 409;
        case "not_selected":
        case "invalid_route":
            return 404;
        case "not_authorized":
            return actor.kind === "anonymous" ? 401 : 403;
        case "unsupported_behavior":
            return 501;
        case "invalid_provider_response":
        case "transport_failure":
            return 502;
        default:
            return 503;
    }
}

function jsonResponse(
    value: unknown,
    status: number,
    requestId?: string,
    responseHeaders?: Readonly<Record<string, string>>,
): Response {
    return Response.json(value, {
        status,
        headers: {
            "cache-control": "private, no-store",
            ...(requestId ? { "x-ulvia-request-id": requestId } : {}),
            ...responseHeaders,
        },
    });
}
