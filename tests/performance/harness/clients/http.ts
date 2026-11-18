import { capabilityRequest } from "../transport/http";
import { nativeRequest, providerRequest } from "../transport/provider";
import { observe } from "./observe";
import { ClientFailure } from "./failure";
import type { ClientCall } from "./types";

export async function observeHttp(call: ClientCall) {
    const request = capabilityRequest(
        call.origin,
        call.target,
        call.binding,
        call.input,
        call.credentials,
        undefined,
        call.idempotencyKey,
    );
    return observeRequest(call, request);
}

export async function observeProvider(call: ClientCall, requestId = crypto.randomUUID()) {
    const request = providerRequest(
        call.origin,
        call.target,
        call.binding,
        call.input,
        call.credentials,
        requestId,
        call.idempotencyKey,
    );
    return observeRequest(call, request);
}

/** Public Provider mounts retain their own anonymous authority and admitted response validation. */
export function observeNative(call: ClientCall) {
    return observeRequest(call, nativeRequest(call.origin, call.target, call.binding, call.input, call.credentials));
}

function observeRequest(call: ClientCall, request: ReturnType<typeof capabilityRequest>) {
    return observe(
        call,
        request.traceId,
        request.requestBytes,
        (signal) => fetch(request.url, { ...request.init, signal }),
        (bytes, response) => {
            if (!request.compiled.response.successStatuses.includes(response.status)) {
                throw new ClientFailure("undeclared-http-success-status");
            }
            return call.target.definition.output.type === "binary" &&
                call.target.definition.behavior.execution !== "operation"
                ? bytes
                : bytes.length === 0 && call.target.definition.output.type === "null"
                  ? null
                  : JSON.parse(new TextDecoder().decode(bytes));
        },
    );
}
