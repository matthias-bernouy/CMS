import { capabilityRequest } from "../transport/http";
import { observe } from "./observe";
import { ClientFailure } from "./failure";
import type { ClientCall } from "./types";

export async function observeHttp(call: ClientCall) {
    const request = capabilityRequest(call.origin, call.target, call.binding, call.input, call.credentials);
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
