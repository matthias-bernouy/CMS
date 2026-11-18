import { capabilityRequest } from "./http";
import type { CapabilityTarget } from "../../capabilities/types";

/** Use the real Provider HTTP mount with its dedicated control or signed invocation credential. */
export function providerRequest(
    origin: string,
    target: CapabilityTarget,
    binding: string,
    input: Readonly<Record<string, unknown>>,
    credentials: Readonly<{ cookie?: string; token?: string }>,
    requestId: string,
    idempotencyKey?: string,
) {
    if (
        !credentials.token ||
        credentials.cookie ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(requestId)
    ) {
        throw new Error("Provider performance calls require a dedicated credential and UUID request ID");
    }
    const request = nativeRequest(origin, target, binding, input, credentials, requestId, idempotencyKey);
    request.init.headers.set("x-ulvia-request-id", requestId);
    request.init.headers.set("x-ulvia-contract-id", target.release.contractId);
    request.init.headers.set("x-ulvia-contract-version", target.release.version);
    request.init.headers.set("x-ulvia-capability-id", target.definition.id);
    return request;
}

/** Resolve the admitted native mount; authentication remains the caller's explicit adapter choice. */
export function nativeRequest(...args: Parameters<typeof capabilityRequest>) {
    const [, target] = args;
    const request = capabilityRequest(...args);
    const prefix = `/.cms/call/${target.release.contractId}`;
    if (!request.url.pathname.startsWith(`${prefix}/`)) {
        throw new Error("Provider performance request does not match the compiled target");
    }
    request.url.pathname = request.url.pathname.slice(prefix.length);
    return request;
}
