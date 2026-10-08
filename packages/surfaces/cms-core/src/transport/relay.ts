import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseCapabilityOperationHandle } from "@bernouy/cms-repository/contracts/protocol";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import { RequestBodyTooLargeError } from "@bernouy/http-runner";
import {
    CoreCapabilityDispatchError,
    type CoreBinaryResult,
    type CoreCapabilityDispatcher,
    type CoreCapabilityInvocationContext,
} from "../dispatch/registry";
import { coreInvocationContext } from "./context";
import { decodeCoreContractInput } from "./input";
import type { CoreRoute } from "./routes";

export function createCoreContractRelay(
    routes: readonly CoreRoute[],
    dispatcher: CoreCapabilityDispatcher,
): (request: Request) => Promise<Response | null> {
    return async (request) => {
        const url = new URL(request.url);
        const requestedContract = request.headers.get("x-ulvia-contract-id");
        const selected = routes
            .filter((route) => route.contractId === requestedContract)
            .map((route) => ({ route, parameters: route.match(request.method, url.pathname) }))
            .find(({ parameters }) => parameters !== null);
        if (!selected?.parameters) {
            return null;
        }
        const { contractId, capability } = selected.route;
        let input: Readonly<Record<string, unknown>>;
        let context: CoreCapabilityInvocationContext;
        try {
            const decoded = await decodeCoreContractInput(request, url, capability, selected.parameters);
            input = decoded.input;
            validateCoreInput(capability, input, Boolean(decoded.binaryBody));
            context = {
                ...coreInvocationContext(request),
                ...(decoded.binaryBody ? { binaryBody: decoded.binaryBody } : {}),
            };
            validateIdempotencyContext(capability, context);
        } catch (cause) {
            return new Response(null, {
                status: cause instanceof RequestBodyTooLargeError ? 413 : 400,
                headers: { "Cache-Control": "no-store" },
            });
        }
        try {
            const output = await dispatcher.invoke(contractId, capability.id, input, context);
            if (capability.output.type === "binary") {
                return binaryResponse(request.method, capability, output);
            }
            if (capability.behavior.execution === "operation") {
                parseCapabilityOperationHandle(output);
            } else {
                validateSchemaValue(capability.output, output);
            }
            return successResponse(request.method, capability, output);
        } catch (cause) {
            if (cause instanceof CoreCapabilityDispatchError) {
                const status = capability.binding.response.errorStatuses[cause.code];
                if (status === cause.status) {
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

function validateCoreInput(
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

function isBinaryResult(value: unknown): value is CoreBinaryResult {
    return (
        !!value &&
        typeof value === "object" &&
        (value as CoreBinaryResult).kind === "binary" &&
        (value as CoreBinaryResult).stream instanceof ReadableStream &&
        typeof (value as CoreBinaryResult).contentType === "string"
    );
}

function validateIdempotencyContext(capability: CapabilityDefinition, context: CoreCapabilityInvocationContext): void {
    const keyed = capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed";
    if (Boolean(context.idempotencyKey) !== keyed) {
        throw new TypeError(keyed ? "Missing idempotency key." : "Unexpected idempotency key.");
    }
}

function successResponse(method: string, capability: CapabilityDefinition, output: unknown): Response {
    const status = capability.binding.response.successStatuses[0]!;
    const headers = { "Cache-Control": "no-store" };
    if (method === "HEAD" || status === 204 || status === 205) {
        return new Response(null, { status, headers });
    }
    return Response.json(output, { status, headers });
}
