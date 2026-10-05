import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type {
    GatewayActor,
    GatewayInvoker,
    GatewayOrigin,
    GatewayResult,
} from "cms-gateway/invocation/interfaces/Invocation";
import type { GatewayExecutionPin } from "cms-gateway/execution/interfaces/PageExecution";
import { readGatewayHttpInput } from "cms-gateway/invocation/http/readHttpInput";

export interface GatewayHttpCallOptions {
    readonly invoker: GatewayInvoker;
    readonly siteId: string;
    readonly origin: GatewayOrigin;
    readonly actor: GatewayActor;
    readonly execution?: GatewayExecutionPin;
    /** Full trusted route prefix, including an optional tenant base path. */
    readonly prefix: string;
}

/** HTTP envelope shared by separately authenticated Delivery and Control entrypoints. */
export async function handleGatewayHttpCall(request: Request, options: GatewayHttpCallOptions): Promise<Response> {
    if (request.method !== "POST") {
        return new Response(null, { status: 405, headers: { allow: "POST" } });
    }
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(`${options.prefix}/`)) {
        return new Response(null, { status: 404 });
    }
    const parts = pathname.slice(options.prefix.length + 1).split("/");
    if (parts.length !== 2 || parts.some((part) => !part)) {
        return new Response(null, { status: 404 });
    }
    let contractId: string;
    let capabilityId: string;
    try {
        [contractId, capabilityId] = parts.map(decodeURIComponent) as [string, string];
    } catch {
        return jsonResponse({ error: { code: "invalid_input" } }, 400);
    }
    const identifier = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/;
    if (
        contractId.length > 128 ||
        capabilityId.length > 128 ||
        !identifier.test(contractId) ||
        !identifier.test(capabilityId)
    ) {
        return jsonResponse({ error: { code: "invalid_input" } }, 400);
    }
    try {
        const input = await readGatewayHttpInput(request);
        const result = await options.invoker.invoke({
            siteId: options.siteId,
            contractId,
            capabilityId,
            origin: options.origin,
            actor: options.actor,
            ...(options.execution ? { execution: options.execution } : {}),
            input,
        });
        return resultResponse(result);
    } catch (error) {
        if (!(error instanceof GatewayError)) {
            return jsonResponse({ error: { code: "internal_error" } }, 500);
        }
        return jsonResponse({ error: { code: error.code } }, errorStatus(error, options.actor), error.requestId);
    }
}

function resultResponse(result: GatewayResult): Response {
    if (result.kind === "binary") {
        return new Response(new Uint8Array(result.bytes), {
            status: result.status,
            headers: {
                "cache-control": "private, no-store",
                "content-type": result.contentType,
                "x-ulvia-request-id": result.requestId,
                ...result.responseHeaders,
            },
        });
    }
    if (result.status === 204 || result.status === 205) {
        return new Response(null, {
            status: result.status,
            headers: { "cache-control": "private, no-store", "x-ulvia-request-id": result.requestId },
        });
    }
    return result.kind === "success"
        ? jsonResponse(result.output ?? null, result.status, result.requestId)
        : jsonResponse(
              { error: { code: result.errorCode, output: result.output } },
              result.status,
              result.requestId,
              result.responseHeaders,
          );
}

function errorStatus(error: GatewayError, actor: GatewayActor): number {
    switch (error.code) {
        case "invalid_input":
            return 400;
        case "outcome_unknown":
            return 409;
        case "not_selected":
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
